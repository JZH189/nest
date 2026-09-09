import { loadPackage } from '@nestjs/common/utils/load-package.util';
import { isUndefined } from '@nestjs/common/utils/shared.utils';
import { ClientKafka } from '../client/client-kafka';
import {
  Cluster,
  GroupMember,
  GroupMemberAssignment,
  GroupState,
  MemberMetadata,
} from '../external/kafka.interface';

let kafkaPackage: any = {};

/**
 * Kafka 响应分区分配器（自定义消费者分区分配策略）。
 *
 * Nest 的 Kafka 微服务通过 reply 主题接收请求：客户端发送请求时以
 * correlation id 关联响应，响应默认发往最小分区。该分配器在消费者组
 * rebalance 时保证每个成员总是分到响应主题的"最小分区"，从而与服务端
 * 发送响应的分区选择保持一致，避免响应丢失；剩余分区再轮询分配给成员，
 * 并沿用成员上一次的分配结果（粘性），尽量减少 rebalance 带来的分区迁移。
 */
export class KafkaReplyPartitionAssigner {
  /** 分配器协议名称，KafkaJS 用它在消费者组内协商一致 */
  readonly name = 'NestReplyPartitionAssigner';
  /** 分配器协议版本号 */
  readonly version = 1;

  /**
   * @param clientKafka - 所属的 ClientKafka 实例，用于读取上一次的消费者分配结果
   * @param config - 包含 Kafka 集群元数据（用于查询主题的分区列表）
   */
  constructor(
    private readonly clientKafka: ClientKafka,
    private readonly config: {
      cluster: Cluster;
    },
  ) {
    // 按需加载 kafkajs 包（未安装时抛出友好错误），后续用于协议编解码
    kafkaPackage = loadPackage(
      'kafkajs',
      KafkaReplyPartitionAssigner.name,
      () => require('kafkajs'),
    );
  }

  /**
   * This process can result in imbalanced assignments
   * @param {array} members array of members, e.g: [{ memberId: 'test-5f93f5a3' }]
   * @param {array} topics
   * @param {Buffer} userData
   * @returns {array} object partitions per topic per member
   */
  public async assign(group: {
    members: GroupMember[];
    topics: string[];
  }): Promise<GroupMemberAssignment[]> {
    const assignment = {};
    const previousAssignment = {};

    const membersCount = group.members.length;
    // 1. 解码各成员元数据，并得到排序后的成员 id 列表（保证分配的确定性）
    const decodedMembers = group.members.map(member =>
      this.decodeMember(member),
    );
    const sortedMemberIds = decodedMembers
      .map(member => member.memberId)
      .sort();

    // build the previous assignment and an inverse map of topic > partition > memberId for lookup
    // 2. 收集每个成员上一次的分区分配结果（用于粘性分配，减少 rebalance 迁移）
    decodedMembers.forEach(member => {
      if (
        !previousAssignment[member.memberId] &&
        Object.keys(member.previousAssignment).length > 0
      ) {
        previousAssignment[member.memberId] = member.previousAssignment;
      }
    });

    // build a collection of topics and partitions
    // 3. 汇总所有主题的全部分区（从集群元数据中查询）
    const topicsPartitions = group.topics
      .map(topic => {
        const partitionMetadata =
          this.config.cluster.findTopicPartitionMetadata(topic);
        return partitionMetadata.map(m => {
          return {
            topic,
            partitionId: m.partitionId,
          };
        });
      })
      .reduce((acc, val) => acc.concat(val), []);

    // create the new assignment by populating the members with the first partition of the topics
    // 4. 第一轮：为每个成员优先恢复其上一次分配到的最小分区（与响应发送端保持一致）
    sortedMemberIds.forEach(assignee => {
      if (!assignment[assignee]) {
        assignment[assignee] = {};
      }

      // add topics to each member
      group.topics.forEach(topic => {
        if (!assignment[assignee][topic]) {
          assignment[assignee][topic] = [];
        }

        // see if the topic and partition belong to a previous assignment
        if (
          previousAssignment[assignee] &&
          !isUndefined(previousAssignment[assignee][topic])
        ) {
          // take the minimum partition since replies will be sent to the minimum partition
          const firstPartition = previousAssignment[assignee][topic];

          // create the assignment with the first partition
          assignment[assignee][topic].push(firstPartition);

          // find and remove this topic and partition from the topicPartitions to be assigned later
          // 把该分区从待分配集合中移除，避免重复分配
          const topicsPartitionsIndex = topicsPartitions.findIndex(
            topicPartition => {
              return (
                topicPartition.topic === topic &&
                topicPartition.partitionId === firstPartition
              );
            },
          );

          // only continue if we found a partition matching this topic
          if (topicsPartitionsIndex !== -1) {
            // remove inline
            topicsPartitions.splice(topicsPartitionsIndex, 1);
          }
        }
      });
    });

    // check for member topics that have a partition length of 0
    // 5. 第二轮：为仍未分到任何分区的成员/主题补配第一个可用分区（新成员或新主题的场景）
    sortedMemberIds.forEach(assignee => {
      group.topics.forEach(topic => {
        // only continue if there are no partitions for assignee's topic
        if (assignment[assignee][topic].length === 0) {
          // find the first partition for this topic
          const topicsPartitionsIndex = topicsPartitions.findIndex(
            topicPartition => {
              return topicPartition.topic === topic;
            },
          );

          if (topicsPartitionsIndex !== -1) {
            // find and set the topic partition
            const partition =
              topicsPartitions[topicsPartitionsIndex].partitionId;

            assignment[assignee][topic].push(partition);

            // remove this partition from the topics partitions collection
            topicsPartitions.splice(topicsPartitionsIndex, 1);
          }
        }
      });
    });

    // then balance out the rest of the topic partitions across the members
    // 6. 第三轮：把剩余分区按成员数轮询（取模）分配，尽量均衡
    const insertAssignmentsByTopic = (topicPartition, i) => {
      const assignee = sortedMemberIds[i % membersCount];

      assignment[assignee][topicPartition.topic].push(
        topicPartition.partitionId,
      );
    };

    // build the assignments
    topicsPartitions.forEach(insertAssignmentsByTopic);

    // encode the end result
    // 7. 按 KafkaJS 的 AssignerProtocol 把最终分配结果编码为成员分配协议格式返回
    return Object.keys(assignment).map(memberId => ({
      memberId,
      memberAssignment: kafkaPackage.AssignerProtocol.MemberAssignment.encode({
        version: this.version,
        assignment: assignment[memberId],
      }),
    }));
  }

  /**
   * 声明本分配器使用的协议：订阅的主题列表与成员元数据。
   * 会把成员上一次的分配结果（previousAssignment）序列化进 userData，
   * 以便 rebalance 时各成员之间可以互相知晓对方的历史分配。
   * @param subscription - 订阅信息（主题列表与用户数据）
   * @returns 协议状态（名称 + 编码后的成员元数据），用于加入消费者组
   */
  public protocol(subscription: {
    topics: string[];
    userData: Buffer;
  }): GroupState {
    // 1. 将本客户端上一次的消费者分配结果写入 userData（粘性分配的依据）
    const stringifiedUserData = JSON.stringify({
      previousAssignment: this.getPreviousAssignment(),
    });
    subscription.userData = Buffer.from(stringifiedUserData);

    return {
      name: this.name,
      // 2. 按 KafkaJS 协议编码成员元数据后随协议声明一起提交
      metadata: kafkaPackage.AssignerProtocol.MemberMetadata.encode({
        version: this.version,
        topics: subscription.topics,
        userData: subscription.userData,
      }),
    };
  }

  /**
   * 获取本客户端（ClientKafka）上一次的消费者分区分配结果。
   * @returns 主题到分区列表的分配映射
   */
  public getPreviousAssignment() {
    return this.clientKafka.getConsumerAssignments();
  }

  /**
   * 解码某个组成员的元数据，取出其上一次的分区分配结果。
   * @param member - 组成员（含二进制 memberMetadata）
   * @returns 成员 id 与其 previousAssignment（主题 -> 分区映射）
   */
  public decodeMember(member: GroupMember) {
    // 1. 解码二进制元数据，再从 userData 中反序列化出历史分配信息
    const memberMetadata = kafkaPackage.AssignerProtocol.MemberMetadata.decode(
      member.memberMetadata,
    ) as MemberMetadata;
    const memberUserData = JSON.parse(memberMetadata.userData.toString());

    return {
      memberId: member.memberId,
      previousAssignment: memberUserData.previousAssignment,
    };
  }
}
