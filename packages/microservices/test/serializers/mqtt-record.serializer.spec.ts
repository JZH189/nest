import { expect } from 'chai';
import { MqttRecordBuilder } from '../../record-builders';
import { MqttRecordSerializer } from '../../serializers/mqtt-record.serializer';

// MqttRecordSerializer 单元测试：验证将普通负载或 MqttRecord 序列化为 MQTT 消息记录。
describe('MqttRecordSerializer', () => {
  let instance: MqttRecordSerializer;
  beforeEach(() => {
    instance = new MqttRecordSerializer();
  });
  describe('serialize', () => {
    it('should parse mqtt record instance to a string, ignoring options', () => {
      const mqttMessage = new MqttRecordBuilder()
        .setData({ value: 'string' })
        .setQoS(1)
        .setDup(true)
        .setRetain(true)
        .setProperties({})
        .build();

      expect(
        instance.serialize({
          pattern: 'pattern',
          data: mqttMessage,
        }),
      ).to.deep.eq(
        JSON.stringify({
          pattern: 'pattern',
          data: { value: 'string' },
        }),
      );
    });
    it('should act as an identity function if msg is not an instance of MqttRecord class', () => {
      const packet = {
        pattern: 'pattern',
        data: { random: true },
      };
      expect(instance.serialize(packet)).to.eq(JSON.stringify(packet));
    });
  });
});
