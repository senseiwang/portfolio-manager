/**
 * 通知/告警渠道系统
 *
 * 定义统一通知接口 Notifier，提供 ConsoleNotifier 实现和工厂函数。
 * 未来可扩展为 Telegram、企业微信等渠道。
 */

/** 通知消息 */
export interface NotifyMessage {
  /** 消息类型 */
  type: 'report_complete' | 'alert' | 'error';
  /** 消息标题 */
  title: string;
  /** 消息正文 */
  content: string;
  /** 日期字符串，如 "2026-07-06" */
  date: string;
  /** 附加元数据（可选） */
  metadata?: Record<string, unknown>;
}

/** 统一通知接口 */
export interface Notifier {
  /** 发送通知消息 */
  send(message: NotifyMessage): Promise<void>;
}

/** ConsoleNotifier：控制台输出实现 */
export class ConsoleNotifier implements Notifier {
  async send(message: NotifyMessage): Promise<void> {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${message.type.toUpperCase()}]`;

    console.log(`${prefix} ${message.title}`);
    console.log(`  Date: ${message.date}`);
    console.log(`  Content: ${message.content}`);

    if (message.metadata && Object.keys(message.metadata).length > 0) {
      console.log('  Metadata:', JSON.stringify(message.metadata));
    }
  }
}

/**
 * 创建通知器实例
 *
 * 目前返回 ConsoleNotifier，将来可扩展为环境判断后返回
 * TelegramNotifier、WeWorkNotifier 等。
 */
export function createNotifier(): Notifier {
  return new ConsoleNotifier();
}
