const express = require("express");
const app = express();
require("dotenv").config();
app.use(express.json());
const cors = require("cors");

const dbConfig = require("./config/dbConfig");

const usersRoute = require("./routes/usersRoute");
const examsRoute = require("./routes/examsRoute");
const reportsRoute = require("./routes/reportsRoute");

app.use("/api/users", usersRoute);
app.use("/api/exams", examsRoute);
app.use("/api/reports", reportsRoute);

app.use(cors({
  origin: "https://anshquiz.netlify.app",
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  credentials: true,
}));


const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const port = process.env.PORT || 5000;

// __dirname = path.resolve();

// if (process.env.NODE_ENV === "production") {
//   app.use(express.static(path.join(__dirname, "client", "build")));
//   app.get("*", (req, res) => {
//     res.sendFile(path.resolve(__dirname, "client", "build", "index.html"));
//   });
// }

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "https://anshquiz.netlify.app",
    methods: ["GET", "POST", "DELETE", "PATCH"],},
});

const userTabSwitches = {};
const examLeaderboards = {};

io.on("connection", (socket) => {
  console.log("Socket connected:", socket.id);

  socket.on("tab-switch", ({ userId, examId, count }) => {
    if (!userId || !examId) return;

    console.log(`User ${userId} switched tabs in Exam ${examId}. Count: ${count}`);

    if (!userTabSwitches[userId]) userTabSwitches[userId] = {};
    userTabSwitches[userId][examId] = count;

    const leaderboard = examLeaderboards[examId];
    if (leaderboard) {
      const user = leaderboard.find(u => u.userId === userId);
      if (user) {
        user.tabSwitchCount = count;
        io.to(examId).emit("leaderboard-update", leaderboard);
      }
    }

    if (count >= 3) {
      console.log(`Auto-submit triggered for User ${userId}, Exam ${examId}`);
      socket.emit("force-submit");
    }
  });

  socket.on("exam-submitted", ({ userId, examId }) => {
    if (userTabSwitches[userId]?.[examId]) {
      userTabSwitches[userId][examId] = 0;
      console.log(`Reset tab switch count (submitted): User ${userId}, Exam ${examId}`);
    }
  });

  socket.on("exam-timer-ended", ({ userId, examId }) => {
    if (userTabSwitches[userId]?.[examId]) {
      userTabSwitches[userId][examId] = 0;
      console.log(`Reset tab switch count (timer ended): User ${userId}, Exam ${examId}`);
    }
  });

  socket.on("join-exam-room", ({ examId, userId, name }) => {
    socket.join(examId);

    if (!examLeaderboards[examId]) {
      examLeaderboards[examId] = [];
    }

    const exists = examLeaderboards[examId].find(u => u.userId === userId);
    if (!exists) {
      examLeaderboards[examId].push({
        userId,
        name,
        correctAnswers: 0,
        tabSwitchCount: userTabSwitches[userId]?.[examId] || 0,
      });
    }

    io.to(examId).emit("leaderboard-update", examLeaderboards[examId]);
  });

  socket.on("progress-update", ({ examId, userId, name, correctAnswers, tabSwitchCount }) => {
    const leaderboard = examLeaderboards[examId];
    if (!leaderboard) return;
  
    const user = leaderboard.find(u => u.userId === userId);
    if (user) {
      user.correctAnswers = correctAnswers;
      user.tabSwitchCount = tabSwitchCount;
    }
  
    io.to(examId).emit("leaderboard-update", leaderboard);
  });
  

  socket.on("leave-exam-room", ({ examId, userId }) => {
    if (examLeaderboards[examId]) {
      examLeaderboards[examId] = examLeaderboards[examId].filter(u => u.userId !== userId);
      io.to(examId).emit("leaderboard-update", examLeaderboards[examId]);
    }
  });

  socket.on("disconnect", () => {
    console.log("Socket disconnected:", socket.id);
  });
});

server.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
