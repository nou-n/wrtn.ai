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
