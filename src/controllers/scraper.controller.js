import { ScraperManager } from "../scrapers/ScraperManager.js";
import { schedulerService } from "../services/SchedulerService.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const scraperManager = new ScraperManager();

const runScrapingForAllCommunities = asyncHandler(async (req, res) => {
  try {
    const results = await scraperManager.scrapeAllCommunities();

    return res
      .status(200)
      .json(
        new ApiResponse(200, results, "Scraping completed for all communities")
      );
  } catch (error) {
    throw new ApiError(500, `Scraping failed: ${error.message}`);
  }
});

const runScrapingForCommunity = asyncHandler(async (req, res) => {
  const { communityId } = req.params;

  try {
    const result = await scraperManager.scrapeCommunity(communityId);

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Community scraping completed"));
  } catch (error) {
    throw new ApiError(500, `Community scraping failed: ${error.message}`);
  }
});

const getScrapingStats = asyncHandler(async (req, res) => {
  try {
    const stats = await scraperManager.getScrapingStats();

    return res
      .status(200)
      .json(new ApiResponse(200, stats, "Scraping stats fetched successfully"));
  } catch (error) {
    throw new ApiError(500, `Failed to fetch scraping stats: ${error.message}`);
  }
});

const cleanupPosts = asyncHandler(async (req, res) => {
  const {
    olderThanDays = 30,
    minQualityScore = 0.3,
    maxPostsPerCommunity = 1000,
  } = req.body;

  try {
    const result = await scraperManager.cleanupPosts({
      olderThanDays,
      minQualityScore,
      maxPostsPerCommunity,
    });

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Post cleanup completed"));
  } catch (error) {
    throw new ApiError(500, `Post cleanup failed: ${error.message}`);
  }
});

const testPlatformScraper = asyncHandler(async (req, res) => {
  const { platform } = req.params;
  const { sourceUrl, keywords = [], maxPosts = 5 } = req.body;

  if (!sourceUrl) {
    throw new ApiError(400, "Source URL is required");
  }

  const validPlatforms = ["reddit"];
  if (!validPlatforms.includes(platform)) {
    throw new ApiError(400, "Invalid platform");
  }

  try {
    const scraper = scraperManager.scrapers[platform];
    const testResults = await scraper.scrapeContent({
      sourceUrl,
      keywords,
      maxPosts,
    });

    return res
      .status(200)
      .json(
        new ApiResponse(200, testResults, `${platform} scraper test completed`)
      );
  } catch (error) {
    throw new ApiError(500, `Scraper test failed: ${error.message}`);
  }
});

const getSchedulerStatus = asyncHandler(async (req, res) => {
  try {
    const activeJobs = schedulerService.getActiveJobs();

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          initialized: schedulerService.isInitialized,
          activeJobs: activeJobs,
          totalJobs: activeJobs.length,
        },
        "Scheduler status fetched successfully"
      )
    );
  } catch (error) {
    throw new ApiError(
      500,
      `Failed to fetch scheduler status: ${error.message}`
    );
  }
});

const restartScheduler = asyncHandler(async (req, res) => {
  try {
    await schedulerService.restartAllJobs();

    return res
      .status(200)
      .json(new ApiResponse(200, {}, "Scheduler restarted successfully"));
  } catch (error) {
    throw new ApiError(500, `Failed to restart scheduler: ${error.message}`);
  }
});

const runImmediateScraping = asyncHandler(async (req, res) => {
  try {
    const result = await schedulerService.runImmediateScraping();

    return res
      .status(200)
      .json(new ApiResponse(200, result, "Immediate scraping completed"));
  } catch (error) {
    throw new ApiError(500, `Immediate scraping failed: ${error.message}`);
  }
});

export {
  runScrapingForAllCommunities,
  runScrapingForCommunity,
  getScrapingStats,
  cleanupPosts,
  testPlatformScraper,
  getSchedulerStatus,
  restartScheduler,
  runImmediateScraping,
};
