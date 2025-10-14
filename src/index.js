import "dotenv/config";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import { schedulerService } from "./services/SchedulerService.js";

const PORT = process.env.PORT || 8082;

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${process.env.PORT}`);

      // Initialize scheduler service after server starts
      schedulerService.initialize().catch((error) => {
        console.error("Failed to initialize scheduler service:", error);
      });
    });
  })
  .catch((err) => {
    console.log("MongoDB connection failed!! ", err);
  });
