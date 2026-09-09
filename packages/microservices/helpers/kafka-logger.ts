import { logLevel } from '../external/kafka.interface';

/**
 * Kafka 日志适配器工厂。
 *
 * KafkaJS 要求使用者注入一个自定义日志记录函数，本工厂把 Nest 的
 * Logger 适配成 KafkaJS 期望的日志签名。适配时根据 KafkaJS 的日志
 * 级别映射到 Nest logger 的对应方法（error/warn/log/debug），
 * 并把 namespace、label 与附加信息拼进日志内容。
 */
export const KafkaLogger =
  /**
   * KafkaJS 日志记录函数。
   * @param params - KafkaJS 传入的日志参数（namespace、level、label、log）
   */
  (logger: any) =>
  ({ namespace, level, label, log }) => {
    let loggerMethod: string;

    // 1. 将 KafkaJS 日志级别映射到 Nest logger 的方法名
    switch (level) {
      case logLevel.ERROR:
      case logLevel.NOTHING:
        loggerMethod = 'error';
        break;
      case logLevel.WARN:
        loggerMethod = 'warn';
        break;
      case logLevel.INFO:
        loggerMethod = 'log';
        break;
      case logLevel.DEBUG:
      default:
        loggerMethod = 'debug';
        break;
    }

    // 2. 拆出日志正文，其余字段序列化后一并输出，便于排查 Kafka 连接/消费问题
    const { message, ...others } = log;
    if (logger[loggerMethod]) {
      logger[loggerMethod](
        `${label} [${namespace}] ${message} ${JSON.stringify(others)}`,
      );
    }
  };
