import express,{Request,Response} from "express";
import cors from "cors";
import dotenv from "dotenv";
import { error } from "console";
import { StreamChat } from "stream-chat";
import OpenAI from "openai";
import {db} from "./config/database.ts";
import {chats,users} from "./db/schema.ts";
import { eq } from "drizzle-orm";
import { ChatCompletionMessageParam } from "openai/resources";

dotenv.config();

const app = express();

//middlewares 
app.use(cors());
app.use(express.json()); //to send json data
app.use(express.urlencoded({extended: false})); //for form data

//initialise stream client
const chatClient = StreamChat.getInstance(
    process.env.STREAM_API_KEY!,
    process.env.STREAM_API_SECRET!

);

//intitialise openai
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
})

//Register user with stream chat
app.post (
  '/register-user',
  async (req: Request, res: Response): Promise<any> => {
    const { name, email } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    try {
      const userId = email.replace(/[^a-zA-Z0-9_-]/g, '_');

      // Check if user exists
      const userResponse = await chatClient.queryUsers({ id: { $eq: userId } });

      if (!userResponse.users.length) {
        // Add new user to stream
        await chatClient.upsertUser({
          id: userId,
          name: name,
          role: 'user',
        });
      }

      // Check for existing user in database
      const existingUser = await db
        .select()
        .from(users)
        .where(eq(users.userId, userId));

      if (!existingUser.length) {
        console.log(
          `User ${userId} does not exist in the database. Adding them...`
        );
        await db.insert(users).values({ userId, name, email });
      }

      res.status(200).json({ userId, name, email });
    } catch (error) {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
);


//send message to AI (paid API)
app.post('/chat', async (req: Request, res: Response): Promise<any> => {
  const { message, userId } = req.body;

  if (!message || !userId) {
    return res.status(400).json({ error: 'Message and user are required' });
  }

  try {
    // Verify user exists
    const userResponse = await chatClient.queryUsers({ id: userId });

    if (!userResponse.users.length) {
      return res
        .status(404)
        .json({ error: 'user not found. Please register first' });
    }

    // Check user in database
    const existingUser = await db
      .select()
      .from(users)
      .where(eq(users.userId, userId));

    if (!existingUser.length) {
      return res
        .status(404)
        .json({ error: 'User not found in database, please register' });
    }

    // Fetch users past messages for context
    const chatHistory = await db
      .select()
      .from(chats)
      .where(eq(chats.userId, userId))
      .orderBy(chats.createdAt)
      .limit(10);

    // Format chat history for Open AI
    const conversation: ChatCompletionMessageParam[] = chatHistory.flatMap(
      (chat) => [
        { role: 'user', content: chat.message },
        { role: 'assistant', content: chat.reply },
      ]
    );

    // Add latest user messages to the conversation
    conversation.push({ role: 'user', content: message });

    // Send message to OpenAI GPT-4
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: conversation as ChatCompletionMessageParam[],
    });

    const aiMessage: string =
      response.choices[0].message?.content ?? 'No response from AI';

    // Save chat to database
    await db.insert(chats).values({ userId, message, reply: aiMessage });

    // Create or get channel
    const channel = chatClient.channel('messaging', `chat-${userId}`, {
      //name: 'AI Chat',
      created_by_id: 'ai_bot',
    });

    await channel.create();
    await channel.sendMessage({ text: aiMessage, user_id: 'ai_bot' });

    res.status(200).json({ reply: aiMessage });
  } catch (error) {
    console.log('Error generating AI response', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get chat history for a user
app.post('/get-messages', async (req: Request, res: Response): Promise<any> => {
  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'User ID is required' });
  }

  try {
    const chatHistory = await db
      .select()
      .from(chats)
      .where(eq(chats.userId, userId));

    res.status(200).json({ messages: chatHistory });
  } catch (error) {
    console.log('Error fetching chat history', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 8000;

app.listen(PORT,() => {
    console.log(`Server running on ${PORT}`);
})