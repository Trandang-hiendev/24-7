require('dotenv').config();
const { Client, GatewayIntentBits, ActivityType } = require('discord.js');
const { joinVoiceChannel, createAudioResource, createAudioPlayer, getVoiceConnection } = require('@discordjs/voice');
const { TextToSpeechClient } = require('@google-cloud/text-to-speech');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates
    ],
});

try {
    const { version } = require('discord.js/package.json');
    console.log(`Sử dụng Discord.js v${version}`);
} catch (error) {
    console.error('Không thể kiểm tra phiên bản Discord.js:', error);
}

client.on('ready', () => {
    console.log(`${client.user.username} đã sẵn sàng!`);
  
    client.user.setPresence({
        status: 'online',
        activities: [
            {
            name: 'Never mind to me',
            type: ActivityType.PLAYING, 
            },
        ],
    });
  
    const channelNotifyId = '1207914582421540904'; // Đổi ID kênh để thông báo khi bot online
    const channel = client.channels.cache.get(channelNotifyId);

    if (channel) {
        const readyMessage = {
            title: 'Bot đã sẵn sàng!',
            description: `${client.user.username} đã sẵn sàng để phục vụ!`,
            color: 0x2ecc71, 
        };
        channel.send({ embeds: [readyMessage] });
    } else {
        console.error(`Không tìm thấy kênh với ID ${channelNotifyId}`);
    }
});

const prefix = '!';

const fs = require('fs');
const util = require('util');

const textToSpeechClient = new TextToSpeechClient({
    keyFilename: './src/json/TTS.json' // Thay 'path/to/keyfile.json' bằng đường dẫn tới tệp khóa JSON của bạn
});

const cooldowns = new Map();

let isBotSpeaking = false;

async function textToSpeech(text, outputFile) {
    const request = {
        input: { text: text },
        voice: { languageCode: 'vi-VN', ssmlGender: 'FEMALE' }, // Điều chỉnh ngôn ngữ và giới tính ở đây
        audioConfig: { audioEncoding: 'MP3' }, // Có thể thay 'MP3' bằng 'LINEAR16' nếu bạn muốn dạng âm thanh khác
    };

    const [response] = await textToSpeechClient.synthesizeSpeech(request);
    const writeFile = util.promisify(fs.writeFile);
    await writeFile(outputFile, response.audioContent, 'binary');
}

client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    if (message.content.startsWith(prefix + 'say')) {
        const text = message.content.slice((prefix + 'say').length).trim();
        const outputFile = 'output.mp3'; // Đường dẫn và tên tệp âm thanh đầu ra

        // Kiểm tra cooldown của người dùng
        if (cooldowns.has(message.author.id)) {
            const cooldownExpirationTime = cooldowns.get(message.author.id);
            const currentTime = Date.now();
            const cooldownTimeLeft = cooldownExpirationTime - currentTime;

            if (cooldownTimeLeft > 0) {
                return message.reply(`Xin đợi ${Math.ceil(cooldownTimeLeft / 1000)} giây trước khi sử dụng lệnh này.`);
            }
        }

        if (isBotSpeaking) {
            return message.reply('Bot đang nói, hãy chờ cho đến khi bot nói xong trước khi sử dụng lệnh này.');
        }

        try {
            await textToSpeech(text, outputFile);

            const memberChannel = message.member.voice.channel;
            const botConnection = getVoiceConnection(message.guild.id);

            if (!memberChannel) {
                return message.reply('Bạn phải tham gia một kênh thoại trước khi sử dụng lệnh này.');
            }

            if (botConnection && botConnection.joinConfig.channelId !== memberChannel.id) {
                return message.reply('Bot đang sử dụng ở kênh thoại khác.');
            }

            isBotSpeaking = true; // Đặt biến isBotSpeaking thành true để xác định rằng bot đang nói

            const connection = joinVoiceChannel({
                channelId: memberChannel.id,
                guildId: message.guild.id,
                adapterCreator: message.guild.voiceAdapterCreator
            });

            const player = createAudioPlayer();
            const resource = createAudioResource('output.mp3');

            player.on('idle', () => {
                isBotSpeaking = false; // Đặt biến isBotSpeaking thành false khi bot kết thúc nói
            });

            player.play(resource);
            connection.subscribe(player);

            // Đặt cooldown cho người dùng
            const cooldownAmount = 3000; // 3 giây
            cooldowns.set(message.author.id, Date.now() + cooldownAmount);
            setTimeout(() => cooldowns.delete(message.author.id), cooldownAmount);
        } catch (error) {
            console.error('Lỗi khi chuyển đổi văn bản thành tiếng nói:', error);
            message.reply('Đã xảy ra lỗi khi cố gắng chuyển đổi văn bản thành tiếng nói.');
        }
    } else if (message.content.startsWith(prefix + 'quit')) {
        const channel = message.member.voice.channel;
        if (!channel) {
            return message.reply('Bot không tham gia vào bất kỳ kênh thoại nào.');
        }

        const connection = getVoiceConnection(message.guild.id);
        if (!connection) {
            return message.reply('Bot không tham gia vào bất kỳ kênh thoại nào.');
        }
    
        connection.destroy();
    
        message.reply('Bot đã thoát khỏi kênh thoại.');
    }
});

client.on('voiceStateUpdate', async (oldState, newState) => {
    const connection = getVoiceConnection(oldState.guild.id);

    if (connection && connection.joinConfig.channelId === oldState.channelId) {
        const channelMembers = oldState.channel.members.filter(member => !member.user.bot);
        
        if (channelMembers.size === 0) {
            connection.destroy();
            // console.log('Bot đã tự động ngắt kết nối vì không còn ai trong kênh thoại.');
        }
    }
});

client.login(process.env.TOKEN);