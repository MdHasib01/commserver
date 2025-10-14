import cron from "node-cron";
import { ScraperManager } from "../scrapers/ScraperManager.js";
import { Community } from "../models/community.model.js";
import { autoLikeService } from "./AutoLikeService.js";

class SchedulerService {
  constructor() {
    this.scraperManager = new ScraperManager();
    this.jobs = new Map();
    this.isInitialized = false;
  }

  /**
   * Initialize the scheduler service
   */
  async initialize() {
    if (this.isInitialized) {
      console.log("Scheduler service already initialized");
      return;
    }

    console.log("Initializing scheduler service...");

    try {
      // Schedule scraping jobs based on community configurations
      await this.scheduleScrapingJobs();

      // Schedule cleanup job (daily at 2 AM)
      this.scheduleCleanupJob();

      // Schedule stats update job (every 6 hours)
      this.scheduleStatsUpdateJob();

      // Schedule auto-like increment job (every 5 minutes)
      this.scheduleAutoLikeJob();

      this.isInitialized = true;
      console.log("✅ Scheduler service initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize scheduler service:", error);
      throw error;
    }
  }

  /**
   * Schedule scraping jobs for all communities
   */
  async scheduleScrapingJobs() {
    try {
      const communities = await Community.find({
        isActive: true,
        "scrapingPlatforms.isActive": true,
      });

      console.log(
        `Setting up scraping schedules for ${communities.length} communities`
      );

      // Schedule single job for all communities (every 5 minutes)
      this.scheduleRegularScrapingJob();
    } catch (error) {
      console.error("Error scheduling scraping jobs:", error);
      throw error;
    }
  }

  /**
   * Schedule regular scraping job (every 5 minutes, 1 post per platform)
   */
  scheduleRegularScrapingJob() {
    const jobId = "regular_scraping";

    // Stop existing job if it exists
    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId).stop();
      this.jobs.delete(jobId);
    }

    // Every 15 minutes
    const cronSchedule = "*/15 * * * *";

    const job = cron.schedule(
      cronSchedule,
      async () => {
        console.log(`🔄 Starting regular scraping (1 post per platform)...`);

        try {
          const result =
            await this.scraperManager.scrapeSinglePostFromAllCommunities();
          console.log(
            `✅ Regular scraping completed: ${result.totalPostsCreated} posts created`
          );
        } catch (error) {
          console.error(`❌ Regular scraping failed:`, error.message);
        }
      },
      {
        scheduled: true,
        timezone: "UTC",
      }
    );

    this.jobs.set(jobId, job);
    console.log(`📅 Scheduled regular scraping every 5 minutes`);
  }

  /**
   * Remove cleanup job scheduling (no longer needed)
   */
  scheduleCleanupJob() {
    console.log("📅 Cleanup job scheduling disabled as requested");
  }

  /**
   * Schedule auto-like increment job (every 5 minutes)
   */
  scheduleAutoLikeJob() {
    const jobId = "auto_like_increment";

    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId).stop();
      this.jobs.delete(jobId);
    }

    const job = cron.schedule(
      "*/5 * * * *",
      async () => {
        console.log("❤️ Starting auto-like increment job...");

        try {
          const result = await autoLikeService.incrementLikesForRecentPosts();
          console.log(
            `✅ Auto-like increment completed: ${result.totalLikesAdded} likes added to ${result.postsUpdated} posts`
          );
        } catch (error) {
          console.error("❌ Auto-like increment failed:", error.message);
        }
      },
      {
        scheduled: true,
        timezone: "UTC",
      }
    );

    this.jobs.set(jobId, job);
    console.log("📅 Scheduled auto-like increment every 5 minutes");
  }

  /**
   * Schedule stats update job
   */
  scheduleStatsUpdateJob() {
    const jobId = "update_stats";

    // Stop existing job if it exists
    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId).stop();
      this.jobs.delete(jobId);
    }

    // Every 6 hours
    const job = cron.schedule(
      "0 */6 * * *",
      async () => {
        console.log("📊 Starting scheduled stats update...");

        try {
          await this.updateCommunityStats();
          console.log("✅ Scheduled stats update completed");
        } catch (error) {
          console.error("❌ Scheduled stats update failed:", error.message);
        }
      },
      {
        scheduled: true,
        timezone: "UTC",
      }
    );

    this.jobs.set(jobId, job);
    console.log("📅 Scheduled stats update every 6 hours");
  }

  /**
   * Update community statistics
   */
  async updateCommunityStats() {
    try {
      const communities = await Community.find({ isActive: true });

      for (const community of communities) {
        // This would typically update cached statistics
        // For now, we'll just log the update
        console.log(`Updating stats for community: ${community.name}`);
      }
    } catch (error) {
      console.error("Error updating community stats:", error);
      throw error;
    }
  }

  /**
   * Add or update a community's scraping schedule
   */
  async updateCommunitySchedule(communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error("Community not found");
      }

      this.scheduleCommunityScrapingJob(community);
      console.log(`Updated scraping schedule for community: ${community.name}`);
    } catch (error) {
      console.error(`Error updating community schedule:`, error);
      throw error;
    }
  }

  /**
   * Remove a community's scraping schedule
   */
  removeCommunitySchedule(communityId) {
    const jobId = `scrape_${communityId}`;

    if (this.jobs.has(jobId)) {
      this.jobs.get(jobId).stop();
      this.jobs.delete(jobId);
      console.log(`Removed scraping schedule for community: ${communityId}`);
    }
  }

  /**
   * Get all active jobs
   */
  getActiveJobs() {
    const activeJobs = [];

    for (const [jobId, job] of this.jobs.entries()) {
      activeJobs.push({
        id: jobId,
        running: job.running,
        scheduled: job.scheduled,
      });
    }

    return activeJobs;
  }

  /**
   * Stop all scheduled jobs
   */
  stopAllJobs() {
    console.log("Stopping all scheduled jobs...");

    for (const [jobId, job] of this.jobs.entries()) {
      job.stop();
      console.log(`Stopped job: ${jobId}`);
    }

    this.jobs.clear();
    this.isInitialized = false;
    console.log("All scheduled jobs stopped");
  }

  /**
   * Restart all jobs
   */
  async restartAllJobs() {
    this.stopAllJobs();
    await this.initialize();
  }

  /**
   * Run immediate scraping for all communities (manual trigger)
   */
  async runImmediateScraping() {
    console.log("🚀 Running immediate scraping for all communities...");

    try {
      const result = await this.scraperManager.scrapeAllCommunities();
      console.log("✅ Immediate scraping completed:", result);
      return result;
    } catch (error) {
      console.error("❌ Immediate scraping failed:", error);
      throw error;
    }
  }
}

// Create singleton instance
const schedulerService = new SchedulerService();

export { schedulerService, SchedulerService };
