import mixpanel from "mixpanel-browser";
import axios from "axios";

/**
 * TODO:
 * - 로그인 함수
 * - 채팅방 삭제 함수
 */

export class Client {
    public token: string;
    public refreshToken: string;
    public distinctId: string;
    public wrtnId: string;
    public headers: object;
    public expiredAt: number;
    public email: string;

    constructor (token: string, refreshToken: string) {
        this.refreshToken = refreshToken;
        this.token = token;

        const tokenBody = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf-8"));
        this.expiredAt = tokenBody["exp"] * 1000;
        this.email = tokenBody["email"];

        mixpanel.init("78c86210f74e622ec77ded5882a5762b");
        this.distinctId = mixpanel.get_distinct_id();
        this.wrtnId = `W1.3.2501006464537361290005373651080192024.${crypto.getRandomValues(new Uint8Array(21)).reduce((c,b)=>c + (36 > (b &= 63) ? b.toString(36) : 62 > b ? (b - 26).toString(36).toUpperCase() : 62 < b ? "-" : "_"), "")}.${Date.now()}`;
    
        this.headers = {
            "Referer": "https://wrtn.ai/",
            "sec-ch-ua": "\"Google Chrome\";v=\"129\", \"Not=A?Brand\";v=\"8\", \"Chromium\";v=\"129\"",
            "sec-ch-ua-mobile": "?0",
            "sec-ch-ua-platform": "\"Windows\"",
            "sec-fetch-dest": "empty",
            "sec-fetch-mode": "cors",
            "sec-fetch-site": "same-site",
            "priority": "u=1, i",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
        }
    }

    async newChat(): Promise<Chat> {
        await this.refresh();
        const chat = new Chat(this);
        await chat.initialize();
        return chat;
    }

    async refresh(): Promise<void> {
        if(this.expiredAt - Date.now() <= 120000) {
            const refreshRequest = await axios.post("https://api.wrtn.ai/be/auth/refresh", null, {
                headers: {
                    "accept": "application/json, text/plain, */*",
                    "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                    "content-type": "application/x-www-form-urlencoded",
                    "refresh": this.refreshToken,
                    "Referrer-Policy": "strict-origin-when-cross-origin",
                    ...this.headers
                }
            });
            if(refreshRequest.status == 201) {
                const refreshData = refreshRequest.data;
                if(refreshData["result"] == "SUCCESS") {
                    this.token = refreshData["data"]["accessToken"];
                    this.expiredAt = new Date(refreshData["data"]["accessTokenExpiredAt"]).getTime();
                    console.info(`새로운 토큰을 발급받았습니다. (${this.token})`);
                }else{
                    throw new Error(`Client.refresh | 새 토큰을 가져오지 못했습니다. (${refreshData["result"]})`);
                }
            }else{
                throw new Error(`Client.refresh | 새 토큰을 가져오지 못했습니다. (${refreshRequest.status})`);
            }
        }
    }
}

export class Chat {
    private socket: WebSocket;
    private client: Client;
    private chatId: string;
    private connected: boolean;
    private socketLoaded: boolean;

    private currentRequestId: string;
    private lastRequestId: string;
    private lastResponse: string;
    private sent: boolean;

    constructor(client: Client) {
        this.client = client;

        this.chatId = "";
        this.connected = false;
        this.socketLoaded = false;

        this.currentRequestId = "";
        this.lastRequestId = "";
        this.lastResponse = "";
        this.sent = false;

        this.socket = new WebSocket("wss://william.wow.wrtn.ai/socket.io/?EIO=4&transport=websocket");
        this.socket.addEventListener("message", (event) => {
            const response: string = event.data.toString();
            if(response.startsWith("40/v1/chat,{\"sid\"")){
                this.socketLoaded = true;
            } else if (response == "2") {
                this.socket.send("3");
            } else if (response.startsWith("0{")) {
                this.sendSocket("40/v1/chat", {
                    "refreshToken": this.client.refreshToken,
                    "token": `Bearer ${this.client.token}`
                });
            } else {
                try{
                    const path = response.split(",")[0];
                    const data = JSON.parse(response.substring(path.length + 1));
                    const type = data[0];
                    if(type == "connectChat") {
                        this.connected = true;
                    }
                    if(type == "data") {
                        this.sent = true;
                    }
                    if(type == "end") {
                        this.sent = false;
                        this.lastRequestId = data[1]["message"]["meta"]["williamRequestId"];
                        this.lastResponse = data[1]["message"]["content"];
                    }
                }catch{
                    throw new Error(`Chat.constructor | 웹 소켓 메시지를 파싱하지 못했습니다.`);
                }
            }
        });
    }

    async initialize(): Promise<void> {
        if(!this.chatId) {
            const chatRoomRequest = await axios.post("https://william.wow.wrtn.ai/chat-room", {"type":"model","headers":{"x-wrtn-id":this.client.wrtnId}}, {
                "headers": {
                  "accept": "application/json, text/plain, */*",
                  "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
                  "authorization": `Bearer ${this.client.token}`,
                  "mixpanel-distinct-id": this.client.distinctId,
                  "platform": "web",
                  "wrtn-locale": "ko-KR",
                  "x-wrtn-id": this.client.wrtnId,
                  "Content-Type": "application/json",
                  ...this.client.headers
                }
            });
            if(chatRoomRequest.status == 201) {
                const chatRoomData = chatRoomRequest.data;
                if(chatRoomData["result"] == "SUCCESS") {
                    await this.waitForSocketConnection();
                    // console.log(chatRoomData["data"]);
                    this.chatId = chatRoomData["data"]["_id"];
                    this.sendSocket("42/v1/chat", [
                        "enterChat", {
                            "chatId": this.chatId,
                            "clientHeaders": {
                                "x-wrtn-id": this.client.wrtnId
                            }
                        }
                    ]);
                    let count: number = 0;
                    while(!this.connected) {
                        if(count >= 100) throw new Error(`Chat.initialize | 채팅방 연결에 실패했습니다.`);
                        await new Promise(resolve => setTimeout(resolve, 100));
                        count++;
                    }
                }else{
                    throw new Error(`Chat.initialize | 채팅방을 가져오지 못했습니다. (${chatRoomData["result"]})`);
                }
            }else{
                throw new Error(`Chat.initialize | 채팅방을 가져오지 못했습니다. (${chatRoomRequest.status})`);
            }
        }
    }

    async sendMessage(message: string): Promise<string> {
        if(this.connected) {
            if(this.sent) throw new Error(`Chat.sendMessage | 이미 처리 중인 메시지가 있습니다.`);
            await this.client.refresh();
            this.currentRequestId = this.getUUID();
            this.sendSocket("42/v1/chat", [
                "startChat",
                {
                    "message": message,
                    "model": "pro_mode",
                    "mode": "chat",
                    "reroll": false,
                    "commandChipType": "",
                    "images": [],
                    "referenceIds": [],
                    "content": message,
                    "chatId": this.chatId,
                    "email": this.client.email,
                    "platform": "web",
                    "williamRequestId": this.currentRequestId,
                    "clientHeaders": {
                        "x-wrtn-id": this.client.wrtnId,
                        "wrtn-locale": "ko-KR",
                        "x-test-id": "",
                        "wrtn-test-ab-model": {
                            "pro_mode": "A",
                            "chit_chat": "B"
                        }
                    },
                    "adContext": {
                        "adCreativeId": null,
                        "packageAdCreativeId": null,
                        "inventoryCodes": [
                            "CHAT_BRAND",
                            "CHAT_REFERENCE"
                        ]
                    }
                }
            ]);
            this.sent = true;
            let count: number = 0;
            while(this.currentRequestId != this.lastRequestId) {
                if(count >= 1000) throw new Error(`Chat.sendMessage | 메시지 응답을 얻지 못했습니다.`);
                await new Promise(resolve => setTimeout(resolve, 100));
                count++;
            }
            return this.lastResponse;
        }else{
            throw new Error(`Chat.sendMessage | 채팅방에 연결되어 있지 않습니다.`);
        }
    }

    private sendSocket(path: string, message: object): void {
        this.socket.send(`${path},${JSON.stringify(message)}`);
    }

    private getUUID(): string {
        let timestamp = Date.now();
        return "xxxxxxxx-xxxx-4xxx-xxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
            const randomValue = (timestamp + 16 * Math.random()) % 16 | 0;
            timestamp = Math.floor(timestamp / 16);
            return (char === "x" ? randomValue : (randomValue & 3) | 8).toString(16);
        });
    }

    private async waitForSocketConnection(): Promise<void> {
        let count: number = 0;
        while(!this.socketLoaded) {
            if(count >= 100) throw new Error(`Chat.waitForSocketConnection | 웹 소켓 연결에 실패했습니다.`);
            await new Promise(resolve => setTimeout(resolve, 100));
            count++;
        }
    }
}
