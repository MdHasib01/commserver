import { Community } from "../models/community.model.js";
import { Post } from "../models/post.model.js";
import { User } from "../models/user.model.js";
import { RedditScraper } from "./platforms/RedditScraper.js";
import { ScrapingUtils } from "./utils/ScrapingUtils.js";
import { ContentProcessor } from "./utils/ContentProcessor.js";
import { ContentValidator } from "./utils/ContentValidator.js";
import { CommentGeneratorService } from "../services/CommentGeneratorService.js";
import { autoLikeService } from "../services/AutoLikeService.js";

class ScraperManager {
  constructor() {
    this.scrapers = {
      reddit: new RedditScraper(),
    };
    this.utils = new ScrapingUtils();
    this.contentProcessor = new ContentProcessor();
    this.contentValidator = new ContentValidator();
    this.commentGenerator = new CommentGeneratorService();
  }

  /**
   * Scrape single post from each platform for all communities
   */
  async scrapeSinglePostFromAllCommunities() {
    try {
      console.log("Starting single post scraping for all communities...");

      const activeCommunities = await Community.find({
        isActive: true,
        "scrapingPlatforms.isActive": true,
      });

      const results = {
        totalCommunities: activeCommunities.length,
        successfulScrapes: 0,
        failedScrapes: 0,
        totalPostsCreated: 0,
        errors: [],
      };

      for (const community of activeCommunities) {
        try {
          const communityResult = await this.scrapeSinglePostPerPlatform(
            community._id
          );
          results.successfulScrapes++;
          results.totalPostsCreated += communityResult.postsCreated;

          console.log(
            `Ô£à Successfully scraped ${community.name}: ${communityResult.postsCreated} posts`
          );
        } catch (error) {
          results.failedScrapes++;
          results.errors.push({
            community: community.name,
            error: error.message,
          });

          console.error(
            `ÔØî Failed to scrape ${community.name}:`,
            error.message
          );
        }
      }

      console.log("Scraping completed:", results);
      return results;
    } catch (error) {
      console.error("Error in scrapeAllCommunities:", error);
      throw error;
    }
  }

  /**
   * Scrape bulk content for all communities (manual trigger only)
   */
  async scrapeAllCommunities() {
    try {
      console.log("Starting bulk scraping for all communities...");

      const activeCommunities = await Community.find({
        isActive: true,
        "scrapingPlatforms.isActive": true,
      });

      const results = {
        totalCommunities: activeCommunities.length,
        successfulScrapes: 0,
        failedScrapes: 0,
        totalPostsCreated: 0,
        errors: [],
      };

      for (const community of activeCommunities) {
        try {
          const communityResult = await this.scrapeCommunity(community._id);
          results.successfulScrapes++;
          results.totalPostsCreated += communityResult.postsCreated;

          console.log(
            `Ô£à Successfully scraped ${community.name}: ${communityResult.postsCreated} posts`
          );
        } catch (error) {
          results.failedScrapes++;
          results.errors.push({
            community: community.name,
            error: error.message,
          });

          console.error(
            `ÔØî Failed to scrape ${community.name}:`,
            error.message
          );
        }
      }

      console.log("Bulk scraping completed:", results);
      return results;
    } catch (error) {
      console.error("Error in bulk scraping:", error);
      throw error;
    }
  }

  /**
   * Scrape single post per platform for a community
   */
  async scrapeSinglePostPerPlatform(communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error("Community not found");
      }

      console.log(`Scraping single post per platform for: ${community.name}`);

      let totalPostsCreated = 0;
      const platformResults = [];

      // Get platform users for assignment
      const platformUsers = await User.find({ userType: "platform" }).select(
        "_id"
      );
      if (platformUsers.length === 0) {
        throw new Error("No platform users found for post assignment");
      }

      // Scrape 1 post from each active platform
      for (const platformConfig of community.scrapingPlatforms) {
        if (!platformConfig.isActive) continue;
        if (platformConfig.platform !== "reddit") continue;

        try {
          const scraper = this.scrapers[platformConfig.platform];
          if (!scraper) {
            console.warn(
              `No scraper available for platform: ${platformConfig.platform}`
            );
            continue;
          }

          console.log(
            `Scraping 1 post from ${platformConfig.platform} for ${community.name}...`
          );

          const scrapedContent = await scraper.scrapeContent({
            sourceUrl: platformConfig.sourceUrl,
            keywords: platformConfig.keywords,
            maxPosts: 1, // Only 1 post per platform
          });

          // Process and create posts
          const postsCreated = await this.createPostsFromScrapedContent(
            scrapedContent,
            community,
            platformConfig.platform,
            platformUsers
          );

          // Generate AI comments for created posts
          if (postsCreated > 0) {
            await this.generateCommentsForCreatedPosts(
              scrapedContent.slice(0, postsCreated),
              platformConfig.platform
            );
          }

          totalPostsCreated += postsCreated;
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated,
            success: true,
          });
        } catch (platformError) {
          console.error(
            `Error scraping ${platformConfig.platform}:`,
            platformError.message
          );
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated: 0,
            success: false,
            error: platformError.message,
          });
        }
      }

      // Update community's last scraped timestamp
      await Community.findByIdAndUpdate(communityId, {
        lastScrapedAt: new Date(),
        $inc: { postCount: totalPostsCreated },
      });

      return {
        communityId,
        communityName: community.name,
        postsCreated: totalPostsCreated,
        platformResults,
      };
    } catch (error) {
      console.error(
        `Error scraping single posts for community ${communityId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Scrape content for a specific community
   */
  async scrapeCommunity(communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error("Community not found");
      }

      console.log(`Scraping community: ${community.name}`);

      let totalPostsCreated = 0;
      const platformResults = [];

      // Get platform users for assignment
      const platformUsers = await User.find({ userType: "platform" }).select(
        "_id"
      );
      if (platformUsers.length === 0) {
        throw new Error("No platform users found for post assignment");
      }

      // Scrape from each active platform
      for (const platformConfig of community.scrapingPlatforms) {
        if (!platformConfig.isActive) continue;
        if (platformConfig.platform !== "reddit") continue;

        try {
          const scraper = this.scrapers[platformConfig.platform];
          if (!scraper) {
            console.warn(
              `No scraper available for platform: ${platformConfig.platform}`
            );
            continue;
          }

          console.log(
            `Scraping ${platformConfig.platform} for ${community.name}...`
          );

          const scrapedContent = await scraper.scrapeContent({
            sourceUrl: platformConfig.sourceUrl,
            keywords: platformConfig.keywords,
            maxPosts: community.scrapingConfig.maxPostsPerScrape || 50,
          });

          // Process and create posts
          const postsCreated = await this.createPostsFromScrapedContent(
            scrapedContent,
            community,
            platformConfig.platform,
            platformUsers
          );

          // Generate AI comments for created posts
          if (postsCreated > 0) {
            await this.generateCommentsForCreatedPosts(
              scrapedContent.slice(0, postsCreated),
              platformConfig.platform
            );
          }

          totalPostsCreated += postsCreated;
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated,
            success: true,
          });
        } catch (platformError) {
          console.error(
            `Error scraping ${platformConfig.platform}:`,
            platformError.message
          );
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated: 0,
            success: false,
            error: platformError.message,
          });
        }
      }

      // Update community's last scraped timestamp
      await Community.findByIdAndUpdate(communityId, {
        lastScrapedAt: new Date(),
        $inc: { postCount: totalPostsCreated },
      });

      return {
        communityId,
        communityName: community.name,
        postsCreated: totalPostsCreated,
        platformResults,
      };
    } catch (error) {
      console.error(`Error scraping community ${communityId}:`, error);
      throw error;
    }
  }

  /**
   * Generate AI comments for created posts
   */
  async generateCommentsForCreatedPosts(scrapedContent, platform) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.log(
          "OpenAI API key not configured, skipping comment generation"
        );
        return;
      }

      for (const content of scrapedContent) {
        try {
          // Find the created post
          const post = await Post.findOne({
            platform: platform,
            originalId: content.id,
          });

          if (!post) {
            console.log(`Post not found for comment generation: ${content.id}`);
            continue;
          }

          // Generate 10-15 AI comments for this post
          const commentCount = Math.floor(Math.random() * 6) + 10; // 10-15 comments
          await this.commentGenerator.generateCommentsForPost(
            post._id,
            commentCount
          );

          console.log(
            `Ô£à Generated AI comments for post: ${post.title.substring(0, 30)}...`
          );

          // Add delay to avoid overwhelming the API
          await this.utils.delay(2000);
        } catch (error) {
          console.error(
            `Error generating comments for post ${content.id}:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(`Error in comment generation process:`, error.message);
    }
  }

  /**
   * Scrape authentic content for a specific community
   * Ensures only original, non-promotional content is collected
   */
  async scrapeAuthenticContent(communityId, postsPerPlatform = 2) {
    try {
      const community = await Community.findById(communityId);
      if (!community) {
        throw new Error("Community not found");
      }

      console.log(`­ƒöì Scraping authentic content for: ${community.name}`);

      let totalPostsCreated = 0;
      const platformResults = [];

      // Get platform users for assignment
      const platformUsers = await User.find({ userType: "platform" }).select(
        "_id"
      );
      if (platformUsers.length === 0) {
        throw new Error("No platform users found for post assignment");
      }

      // Scrape from each active platform
      for (const platformConfig of community.scrapingPlatforms) {
        if (!platformConfig.isActive) continue;
        if (platformConfig.platform !== "reddit") continue;

        try {
          const scraper = this.scrapers[platformConfig.platform];
          if (!scraper) {
            console.warn(
              `No scraper available for platform: ${platformConfig.platform}`
            );
            continue;
          }

          console.log(
            `­ƒÄ» Scraping ${postsPerPlatform} authentic posts from ${platformConfig.platform}...`
          );

          // Scrape with authenticity focus
          const scrapedContent = await scraper.scrapeContent({
            sourceUrl: platformConfig.sourceUrl,
            keywords: platformConfig.keywords,
            maxPosts: postsPerPlatform * 3, // Get more to filter for authenticity
            authenticityMode: true,
          });

          // Validate and filter authentic content
          const authenticContent = await this.validateAuthenticContent(
            scrapedContent,
            community,
            postsPerPlatform
          );

          // Create posts from authentic content
          const postsCreated = await this.createPostsFromAuthenticContent(
            authenticContent,
            community,
            platformConfig.platform,
            platformUsers
          );

          // Generate AI comments for created posts
          if (postsCreated > 0) {
            await this.generateCommentsForCreatedPosts(
              authenticContent.slice(0, postsCreated),
              platformConfig.platform
            );
          }

          totalPostsCreated += postsCreated;
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated,
            success: true,
          });
        } catch (platformError) {
          console.error(
            `Error scraping ${platformConfig.platform}:`,
            platformError.message
          );
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated: 0,
            success: false,
            error: platformError.message,
          });
        }
      }

      // Update community stats
      await Community.findByIdAndUpdate(communityId, {
        lastScrapedAt: new Date(),
        $inc: { postCount: totalPostsCreated },
      });

      return {
        communityId,
        communityName: community.name,
        totalPosts: totalPostsCreated,
        platformResults,
      };
    } catch (error) {
      console.error(
        `Error scraping authentic content for community ${communityId}:`,
        error
      );
      throw error;
    }
  }

  /**
   * Validate content for authenticity
   */
  async validateAuthenticContent(scrapedContent, community, maxPosts) {
    const authenticContent = [];

    for (const content of scrapedContent) {
      try {
        // Check if content already exists
        const existingPost = await Post.findOne({
          $or: [
            { sourceUrl: content.url },
            { originalId: content.id, platform: content.platform },
          ],
        });

        if (existingPost) {
          console.log(`ÔÜá´©Å Duplicate content found, skipping: ${content.id}`);
          continue;
        }

        // Validate authenticity
        const isAuthentic =
          await this.contentValidator.validateAuthenticity(content);
        if (!isAuthentic.valid) {
          console.log(
            `ÔÜá´©Å Content failed authenticity check: ${isAuthentic.reason}`
          );
          continue;
        }

        // Calculate quality score
        const qualityScore =
          this.contentProcessor.calculateQualityScore(content);

        // Apply higher quality threshold for authentic content
        const minQualityScore =
          community.scrapingConfig.qualityThreshold || 0.6;
        if (qualityScore < minQualityScore) {
          console.log(
            `ÔÜá´©Å Content quality too low (${qualityScore}), skipping...`
          );
          continue;
        }

        authenticContent.push({
          ...content,
          qualityScore,
          authenticityScore: isAuthentic.score,
        });

        // Stop when we have enough authentic content
        if (authenticContent.length >= maxPosts) {
          break;
        }
      } catch (error) {
        console.error(`Error validating content ${content.id}:`, error.message);
      }
    }

    console.log(
      `Ô£à Validated ${authenticContent.length} authentic posts out of ${scrapedContent.length} scraped`
    );
    return authenticContent;
  }

  /**
   * Create posts from authentic content with enhanced metadata
   */
  async createPostsFromAuthenticContent(
    authenticContent,
    community,
    platform,
    users
  ) {
    let postsCreated = 0;

    for (const content of authenticContent) {
      try {
        // Randomly assign a user as the owner
        const randomUser = users[Math.floor(Math.random() * users.length)];

        // Process content with authenticity focus
        const processedContent =
          this.contentProcessor.processAuthenticContent(content);

        // Create the post with enhanced metadata
        const randomLikeCount = Math.floor(Math.random() * 11) + 5;

        const post = await Post.create({
          title: processedContent.title,
          content: processedContent.content,
          sourceUrl: content.url,
          platform,
          originalId: content.id,
          community: community._id,
          owner: randomUser._id,
          engagementMetrics: {
            likes: randomLikeCount || 0,
            comments: 0, // Remove original comment count
            shares: content.shares || 0,
            views: content.views || 0,
          },
          scrapingMetadata: {
            scrapedAt: new Date(),
            originalAuthor: content.author,
            originalCreatedAt: content.createdAt,
            qualityScore: content.qualityScore,
            authenticityScore: content.authenticityScore,
            tags: processedContent.tags,
            contentType: processedContent.contentType,
            isAuthentic: true,
            validationMethod: "enhanced_validation",
          },
          thumbnail: content.thumbnail,
          mediaUrls: processedContent.mediaUrls,
          status: "active",
        });

        postsCreated++;
        console.log(
          `Ô£à Created authentic post: ${post.title.substring(0, 50)}...`
        );

        await autoLikeService.assignInitialLikesToPost(post._id);
      } catch (postError) {
        console.error(
          `Error creating post from ${content.id}:`,
          postError.message
        );
      }
    }

    return postsCreated;
  }

  /**
   * Create posts from scraped content
   */
  async createPostsFromScrapedContent(
    scrapedContent,
    community,
    platform,
    platformUsers
  ) {
    let postsCreated = 0;

    for (const content of scrapedContent) {
      try {
        // Check if post already exists
        const existingPost = await Post.findOne({
          $or: [
            { platform, originalId: content.id },
            { sourceUrl: content.url },
          ],
        });

        if (existingPost) {
          console.log(`Post ${content.id} already exists, skipping...`);
          continue;
        }

        // Process content quality
        const qualityScore =
          this.contentProcessor.calculateQualityScore(content);

        // Skip low-quality content
        if (qualityScore < (community.scrapingConfig.qualityThreshold || 0.5)) {
          console.log(
            `Post ${content.id} quality too low (${qualityScore}), skipping...`
          );
          continue;
        }

        // Randomly assign a platform user as the owner
        const randomUser =
          platformUsers[Math.floor(Math.random() * platformUsers.length)];

        // Process and clean content
        const processedContent = this.contentProcessor.processContent(content);
        const randomLikeCount = Math.floor(Math.random() * 11) + 5;
        // Create the post
        const post = await Post.create({
          title: processedContent.title,
          content: processedContent.content,
          sourceUrl: content.url,
          platform,
          originalId: content.id,
          community: community._id,
          owner: randomUser._id,
          engagementMetrics: {
            likes: randomLikeCount || 0,
            comments: 0, // Remove original comment count
            shares: content.shares || 0,
            views: content.views || 0,
          },
          scrapingMetadata: {
            scrapedAt: new Date(),
            originalAuthor: content.author,
            originalCreatedAt: content.createdAt,
            qualityScore,
            tags: processedContent.tags,
            isAuthentic: true,
            validationMethod: "real_api_scraping",
          },
          thumbnail: content.thumbnail,
          mediaUrls: content.mediaUrls || [],
          status: "active",
        });

        postsCreated++;
        console.log(`Ô£à Created post: ${post.title.substring(0, 50)}...`);

        await autoLikeService.assignInitialLikesToPost(post._id);
      } catch (postError) {
        console.error(
          `Error creating post from ${content.id}:`,
          postError.message
        );
      }
    }

    return postsCreated;
  }

  /**
   * Add a new platform scraper
   */
  async addNewPlatform(platformConfig) {
    const { name, scraperClass, config } = platformConfig;

    if (this.scrapers[name]) {
      throw new Error(`Platform ${name} already exists`);
    }

    this.scrapers[name] = new scraperClass(config);
    console.log(`Added new platform scraper: ${name}`);

    return true;
  }

  /**
   * Get scraping statistics
   */
  async getScrapingStats() {
    const stats = await Post.aggregate([
      {
        $match: {
          "scrapingMetadata.scrapedAt": {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      },
      {
        $group: {
          _id: "$platform",
          count: { $sum: 1 },
          avgQualityScore: { $avg: "$scrapingMetadata.qualityScore" },
          totalEngagement: {
            $sum: {
              $add: [
                "$engagementMetrics.likes",
                "$engagementMetrics.comments",
                "$engagementMetrics.shares",
              ],
            },
          },
        },
      },
    ]);

    return {
      last24Hours: stats,
      totalScrapedPosts: await Post.countDocuments({
        "scrapingMetadata.scrapedAt": { $exists: true },
      }),
    };
  }

  /**
   * Clean up old or low-quality posts
   */
  async cleanupPosts(options = {}) {
    const {
      olderThanDays = 30,
      minQualityScore = 0.3,
      maxPostsPerCommunity = 1000,
    } = options;

    const cutoffDate = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    );

    // Mark old, low-quality posts as hidden
    const hiddenResult = await Post.updateMany(
      {
        createdAt: { $lt: cutoffDate },
        "scrapingMetadata.qualityScore": { $lt: minQualityScore },
        status: "active",
      },
      { status: "hidden" }
    );

    console.log(`Hidden ${hiddenResult.modifiedCount} old, low-quality posts`);

    // For each community, keep only the most recent posts
    const communities = await Community.find({ isActive: true });

    for (const community of communities) {
      const excessPosts = await Post.find({
        community: community._id,
        status: "active",
      })
        .sort({ createdAt: -1 })
        .skip(maxPostsPerCommunity);

      if (excessPosts.length > 0) {
        await Post.updateMany(
          { _id: { $in: excessPosts.map((p) => p._id) } },
          { status: "hidden" }
        );

        console.log(
          `Hidden ${excessPosts.length} excess posts from ${community.name}`
        );
      }
    }

    return {
      hiddenLowQuality: hiddenResult.modifiedCount,
      totalCleaned: hiddenResult.modifiedCount + excessPosts?.length || 0,
    };
  }
}

export { ScraperManager };
