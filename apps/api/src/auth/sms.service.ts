import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import Dysmsapi20170525, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import * as OpenApi from "@alicloud/openapi-client";

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly client: Dysmsapi20170525 | null;

  constructor() {
    if (process.env.SMS_MODE === "aliyun") {
      this.client = new Dysmsapi20170525(new OpenApi.Config({
        accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
        accessKeySecret: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
        endpoint: "dysmsapi.aliyuncs.com",
      }));
    } else {
      this.client = null;
    }
  }

  async sendCode(phone: string, code: string): Promise<void> {
    if (process.env.SMS_MODE === "console" && process.env.NODE_ENV === "development") {
      this.logger.warn(`Development login code for ${phone}: ${code}`);
      return;
    }
    if (!this.client || !process.env.ALIYUN_SMS_SIGN_NAME || !process.env.ALIYUN_SMS_TEMPLATE_CODE) {
      throw new ServiceUnavailableException("SMS delivery is not configured");
    }
    try {
      const response = await this.client.sendSms(new SendSmsRequest({
        phoneNumbers: phone,
        signName: process.env.ALIYUN_SMS_SIGN_NAME,
        templateCode: process.env.ALIYUN_SMS_TEMPLATE_CODE,
        templateParam: JSON.stringify({ code }),
      }));
      if (response.body?.code !== "OK") throw new Error("SMS provider rejected request");
    } catch {
      throw new ServiceUnavailableException("SMS delivery failed");
    }
  }
}
