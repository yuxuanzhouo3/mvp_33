/**
 * CloudBase 连接器
 */

import cloudbase from "@cloudbase/node-sdk";

export class CloudBaseConnector {
  private app: any;
  private db: any;
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const envId = process.env.CLOUDBASE_ENV_ID;
    const secretId = process.env.CLOUDBASE_SECRET_ID;
    const secretKey = process.env.CLOUDBASE_SECRET_KEY;

    if (!envId || !secretId || !secretKey) {
      throw new Error("缺少 CloudBase 配置");
    }

    this.app = cloudbase.init({
      env: envId,
      secretId,
      secretKey,
    });

    this.db = this.app.database();
    this.initialized = true;
  }

  getClient(): any {
    if (!this.initialized) {
      throw new Error("CloudBase 未初始化");
    }
    return this.db;
  }

  getApp(): any {
    if (!this.initialized) {
      throw new Error("CloudBase 未初始化");
    }
    return this.app;
  }
}
