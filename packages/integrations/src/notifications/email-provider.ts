import { EmailDispatchProvider } from "@platform/database";

export interface DispatchedEmailRecord {
  to: string;
  subject: string;
  body: string;
  notificationId: string;
  sentAt: Date;
  attempt: number;
}

/**
 * Mock Email Dispatch Provider
 * Supports automated delivery tracking, failure injection, and retry verification.
 */
export class MockEmailDispatchProvider implements EmailDispatchProvider {
  public sentEmails: DispatchedEmailRecord[] = [];
  public shouldFailNext: number = 0;
  public totalAttempts: number = 0;

  async sendEmail(params: {
    to: string;
    subject: string;
    body: string;
    notificationId: string;
  }): Promise<{ success: boolean; error?: string }> {
    this.totalAttempts++;

    if (this.shouldFailNext > 0) {
      this.shouldFailNext--;
      return { success: false, error: "SMTP Connection Timed Out" };
    }

    this.sentEmails.push({
      ...params,
      sentAt: new Date(),
      attempt: this.totalAttempts,
    });

    return { success: true };
  }

  clear(): void {
    this.sentEmails = [];
    this.shouldFailNext = 0;
    this.totalAttempts = 0;
  }
}
