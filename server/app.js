import express from 'express';
import cors from 'cors';
import {handleChat} from './services/aiService.js';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.post('/chat', handleChat);

app.listen(PORT, () => {
    console.log(`AI Travel Bot running on http://localhost:${PORT}`);
});