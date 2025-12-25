import * as vscode from "vscode";

const TOKEN_KEY = "vercel.personalToken";

export class TokenStore {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getToken(): Thenable<string | undefined> {
    return this.context.secrets.get(TOKEN_KEY);
  }

  async setToken(token: string): Promise<void> {
    await this.context.secrets.store(TOKEN_KEY, token.trim());
  }

  async clearToken(): Promise<void> {
    await this.context.secrets.delete(TOKEN_KEY);
  }
}
