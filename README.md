# wrtn.ai
Chat with AI using the wrtn.ai API

## Installation

To install dependencies:

```bash
bun install
```

## Usage

### Code

```typescript
import { Client } from "./wrtn";

const client = new Client("token", "refresh token");
const chat = await client.newChat();
const response = await chat.sendMessage("안녕");
console.log(response);
```

### Result

```
안녕하세요! 어떻게 도와드릴까요?
```

## How to Obtain Tokens from wrtn.ai

1. **Log in to wrtn.ai**
2. **Open Developer Tools**
   - Press `Ctrl + Shift + I` to open the Developer Tools.
3. **Copy the Authorization Header Value**
   - In the network requests, find the `Authorization` header value (e.g., `eyJhbGciOi...`).
   - This value is your token.
4. **Copy the Refresh Token**
   - Go to the "Application" tab -> "Cookies" -> `https://wrtn.ai`.
   - Copy the value of `refresh_token` (e.g., `eyJhbGciOi...`).
   - This value is your refresh token.
