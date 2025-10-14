import { Router } from "express";
import { ScraperManager } from "../scrapers/ScraperManager.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();
const scraperManager = new ScraperManager();

// All scraper routes require authentication
// router.use(verifyJWT);

/**
 * Scrape all communities
 */
router.get(
  "/scrape-all",
  asyncHandler(async (req, res) => {
    try {
      const results = await scraperManager.scrapeAllCommunities();

      return res
        .status(200)
        .json(
          new ApiResponse(
            200,
            results,
            "Scraping completed for all communities"
          )
        );
    } catch (error) {
      throw new ApiError(500, `Scraping failed: ${error.message}`);
    }
  })
);

/**
 * Scrape specific community
 */
router.get(
  "/scrape/:communityId",
  asyncHandler(async (req, res) => {
    const { communityId } = req.params;

    try {
      const result = await scraperManager.scrapeCommunity(communityId);

      return res
        .status(200)
        .json(new ApiResponse(200, result, "Community scraping completed"));
    } catch (error) {
      throw new ApiError(500, `Community scraping failed: ${error.message}`);
    }
  })
);

/**
 * Get scraping statistics
 */
router.get(
  "/stats",
  asyncHandler(async (req, res) => {
    try {
      const stats = await scraperManager.getScrapingStats();

      return res
        .status(200)
        .json(
          new ApiResponse(200, stats, "Scraping stats fetched successfully")
        );
    } catch (error) {
      throw new ApiError(
        500,
        `Failed to fetch scraping stats: ${error.message}`
      );
    }
  })
);

/**
 * Clean up old posts
 */
router.post(
  "/cleanup",
  asyncHandler(async (req, res) => {
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
  })
);

/**
 * Test scraper for a specific platform
 */
router.post(
  "/test/:platform",
  asyncHandler(async (req, res) => {
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
          new ApiResponse(
            200,
            testResults,
            `${platform} scraper test completed`
          )
        );
    } catch (error) {
      throw new ApiError(500, `Scraper test failed: ${error.message}`);
    }
  })
);

export default router;
