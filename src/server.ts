import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();

//middlewares 
app.use(cors());
app.use(express.json()); //to send json data
app.use(express.urlencoded({extended: false}));

const PORT = process.env.PORT || 8000;

app.listen(PORT,() => {
    console.log(`Server running on ${PORT}`);
})