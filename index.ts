import { Client } from "./wrtn";

(async () => {
    const client = new Client("token", "refresh token");
    const chat = await client.newChat();
    const prompt = "입력: ";
    process.stdout.write(prompt);
    for await (const line of console) {
        const response = await chat.sendMessage(line);
        console.log(response);
        process.stdout.write(prompt);
    }
})();