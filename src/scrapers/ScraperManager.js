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

  // --- helpers --------------------------------------------------------------

  _toUnixSeconds(date) {
    return Math.floor(new Date(date).getTime() / 1000);
  }

  async filterNewContent(items, platform) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const results = await Promise.all(
      items.map(async (c) => {
        const exists = await Post.exists({
          $or: [{ platform, originalId: c.id }, { sourceUrl: c.url }],
        });
        const isSticky = c?.stickied === true || c?.pinned === true;
        return { item: c, keep: !exists && !isSticky };
      })
    );
    return results.filter((r) => r.keep).map((r) => r.item);
  }

  // --- entrypoints ----------------------------------------------------------

  async scrapeSinglePostFromAllCommunities() {
    try {
      console.log("🔁 Starting single post scraping for all communities...");

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
            `✅ Successfully scraped ${community.name}: ${communityResult.postsCreated} post(s)`
          );
        } catch (error) {
          results.failedScrapes++;
          results.errors.push({
            community: community.name,
            error: error.message,
          });
          console.error(
            `❌ Failed to scrape ${community.name}:`,
            error.message
          );
        }
      }

      console.log("📊 Scraping completed:", results);
      return results;
    } catch (error) {
      console.error("❌ Error in scrapeSinglePostFromAllCommunities:", error);
      throw error;
    }
  }

  async scrapeAllCommunities() {
    try {
      console.log("🔁 Starting bulk scraping for all communities...");

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
            `✅ Successfully scraped ${community.name}: ${communityResult.postsCreated} post(s)`
          );
        } catch (error) {
          results.failedScrapes++;
          results.errors.push({
            community: community.name,
            error: error.message,
          });
          console.error(
            `❌ Failed to scrape ${community.name}:`,
            error.message
          );
        }
      }

      console.log("📊 Bulk scraping completed:", results);
      return results;
    } catch (error) {
      console.error("❌ Error in bulk scraping:", error);
      throw error;
    }
  }

  // --- community-level ------------------------------------------------------

  async scrapeSinglePostPerPlatform(communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) throw new Error("Community not found");

      console.log(
        `🔎 Scraping single post per platform for: ${community.name}`
      );

      let totalPostsCreated = 0;
      const platformResults = [];

      // Platform users
      const platformUsers = await User.find({ userType: "platform" }).select(
        "_id"
      );
      if (platformUsers.length === 0) {
        throw new Error("No platform users found for post assignment");
      }

      for (const platformConfig of community.scrapingPlatforms) {
        if (!platformConfig.isActive) continue;
        if (platformConfig.platform !== "reddit") continue;

        try {
          const scraper = this.scrapers[platformConfig.platform];
          if (!scraper) {
            console.warn(
              `⚠️ No scraper available for platform: ${platformConfig.platform}`
            );
            continue;
          }

          console.log(
            `🧪 Scraping 1 post from ${platformConfig.platform} for ${community.name}...`
          );

          const since = community.lastScrapedAt
            ? this._toUnixSeconds(community.lastScrapedAt)
            : undefined;

          const scrapedContent = await scraper.scrapeContent({
            sourceUrl: platformConfig.sourceUrl,
            keywords: platformConfig.keywords,
            maxPosts: 5, // fetch a few, then filter to 1
            sort: "new",
            excludeStickied: true,
            minCreatedUtc: since,
          });

          const newOnly = (
            await this.filterNewContent(scrapedContent, platformConfig.platform)
          ).slice(0, 1); // keep a single new post

          const {
            postsCreated,
            createdItems,
            skippedExisting,
            skippedLowQuality,
          } = await this.createPostsFromScrapedContent(
            newOnly,
            community,
            platformConfig.platform,
            platformUsers
          );

          if (createdItems.length > 0) {
            await this.generateCommentsForCreatedPosts(
              createdItems,
              platformConfig.platform
            );
          }

          totalPostsCreated += postsCreated;
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated,
            skippedExisting,
            skippedLowQuality,
            success: true,
          });

          const summaryBits = [];
          if (postsCreated) summaryBits.push(`created: ${postsCreated}`);
          if (skippedExisting) summaryBits.push(`existing: ${skippedExisting}`);
          if (skippedLowQuality)
            summaryBits.push(`lowQuality: ${skippedLowQuality}`);
          console.log(
            `✅ ${platformConfig.platform} summary → ${summaryBits.join(", ") || "none"}`
          );
        } catch (platformError) {
          console.error(
            `❌ Error scraping ${platformConfig.platform}:`,
            platformError.message
          );
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated: 0,
            skippedExisting: 0,
            skippedLowQuality: 0,
            success: false,
            error: platformError.message,
          });
        }
      }

      // Update lastScrapedAt & counters
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
        `❌ Error scraping single posts for community ${communityId}:`,
        error
      );
      throw error;
    }
  }

  async scrapeCommunity(communityId) {
    try {
      const community = await Community.findById(communityId);
      if (!community) throw new Error("Community not found");

      console.log(`🔎 Scraping community: ${community.name}`);

      let totalPostsCreated = 0;
      const platformResults = [];

      const platformUsers = await User.find({ userType: "platform" }).select(
        "_id"
      );
      if (platformUsers.length === 0) {
        throw new Error("No platform users found for post assignment");
      }

      for (const platformConfig of community.scrapingPlatforms) {
        if (!platformConfig.isActive) continue;
        if (platformConfig.platform !== "reddit") continue;

        try {
          const scraper = this.scrapers[platformConfig.platform];
          if (!scraper) {
            console.warn(
              `⚠️ No scraper available for platform: ${platformConfig.platform}`
            );
            continue;
          }

          console.log(
            `🧪 Scraping ${platformConfig.platform} for ${community.name}...`
          );

          const since = community.lastScrapedAt
            ? this._toUnixSeconds(community.lastScrapedAt)
            : undefined;

          const scrapedContent = await scraper.scrapeContent({
            sourceUrl: platformConfig.sourceUrl,
            keywords: platformConfig.keywords,
            maxPosts: community.scrapingConfig?.maxPostsPerScrape || 50,
            sort: "new",
            excludeStickied: true,
            minCreatedUtc: since,
          });

          const newOnly = await this.filterNewContent(
            scrapedContent,
            platformConfig.platform
          );

          const {
            postsCreated,
            createdItems,
            skippedExisting,
            skippedLowQuality,
          } = await this.createPostsFromScrapedContent(
            newOnly,
            community,
            platformConfig.platform,
            platformUsers
          );

          if (createdItems.length > 0) {
            await this.generateCommentsForCreatedPosts(
              createdItems,
              platformConfig.platform
            );
          }

          totalPostsCreated += postsCreated;
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated,
            skippedExisting,
            skippedLowQuality,
            success: true,
          });

          const summaryBits = [];
          if (postsCreated) summaryBits.push(`created: ${postsCreated}`);
          if (skippedExisting) summaryBits.push(`existing: ${skippedExisting}`);
          if (skippedLowQuality)
            summaryBits.push(`lowQuality: ${skippedLowQuality}`);
          console.log(
            `✅ ${platformConfig.platform} summary → ${summaryBits.join(", ") || "none"}`
          );
        } catch (platformError) {
          console.error(
            `❌ Error scraping ${platformConfig.platform}:`,
            platformError.message
          );
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated: 0,
            skippedExisting: 0,
            skippedLowQuality: 0,
            success: false,
            error: platformError.message,
          });
        }
      }

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
      console.error(`❌ Error scraping community ${communityId}:`, error);
      throw error;
    }
  }

  // --- comments -------------------------------------------------------------

  async generateCommentsForCreatedPosts(createdItems, platform) {
    try {
      if (!process.env.OPENAI_API_KEY) {
        console.log(
          "⚠️ OpenAI API key not configured, skipping comment generation"
        );
        return;
      }

      for (const content of createdItems) {
        try {
          const post = await Post.findOne({
            platform: platform,
            originalId: content.id,
          });

          if (!post) {
            console.log(
              `⏭️ Post not found for comment generation: ${content.id}`
            );
            continue;
          }

          const commentCount = Math.floor(Math.random() * 6) + 10; // 10–15
          await this.commentGenerator.generateCommentsForPost(
            post._id,
            commentCount
          );

          console.log(
            `✅ Generated AI comments for post: ${post.title.substring(0, 30)}...`
          );
          await this.utils.delay(2000);
        } catch (error) {
          console.error(
            `❌ Error generating comments for post ${content.id}:`,
            error.message
          );
        }
      }
    } catch (error) {
      console.error(`❌ Error in comment generation process:`, error.message);
    }
  }

  // --- authenticity path (kept, logs fixed, uses createdItems) --------------

  async scrapeAuthenticContent(communityId, postsPerPlatform = 2) {
    try {
      const community = await Community.findById(communityId);
      if (!community) throw new Error("Community not found");

      console.log(`🔍 Scraping authentic content for: ${community.name}`);

      let totalPostsCreated = 0;
      const platformResults = [];

      const platformUsers = await User.find({ userType: "platform" }).select(
        "_id"
      );
      if (platformUsers.length === 0) {
        throw new Error("No platform users found for post assignment");
      }

      for (const platformConfig of community.scrapingPlatforms) {
        if (!platformConfig.isActive) continue;
        if (platformConfig.platform !== "reddit") continue;

        try {
          const scraper = this.scrapers[platformConfig.platform];
          if (!scraper) {
            console.warn(
              `⚠️ No scraper available for platform: ${platformConfig.platform}`
            );
            continue;
          }

          console.log(
            `🧪 Scraping ${postsPerPlatform} authentic posts from ${platformConfig.platform}...`
          );

          const scrapedContent = await scraper.scrapeContent({
            sourceUrl: platformConfig.sourceUrl,
            keywords: platformConfig.keywords,
            maxPosts: postsPerPlatform * 3,
            authenticityMode: true,
            sort: "new",
            excludeStickied: true,
          });

          const authenticContent = await this.validateAuthenticContent(
            scrapedContent,
            community,
            postsPerPlatform
          );

          const {
            postsCreated,
            createdItems,
            skippedExisting,
            skippedLowQuality,
          } = await this.createPostsFromAuthenticContent(
            authenticContent,
            community,
            platformConfig.platform,
            platformUsers
          );

          if (createdItems.length > 0) {
            await this.generateCommentsForCreatedPosts(
              createdItems,
              platformConfig.platform
            );
          }

          totalPostsCreated += postsCreated;
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated,
            skippedExisting,
            skippedLowQuality,
            success: true,
          });

          console.log(
            `✅ ${platformConfig.platform} authentic summary → created: ${postsCreated}, existing: ${skippedExisting}, lowQuality: ${skippedLowQuality}`
          );
        } catch (platformError) {
          console.error(
            `❌ Error scraping ${platformConfig.platform}:`,
            platformError.message
          );
          platformResults.push({
            platform: platformConfig.platform,
            postsCreated: 0,
            skippedExisting: 0,
            skippedLowQuality: 0,
            success: false,
            error: platformError.message,
          });
        }
      }

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
        `❌ Error scraping authentic content for community ${communityId}:`,
        error
      );
      throw error;
    }
  }

  async validateAuthenticContent(scrapedContent, community, maxPosts) {
    const authenticContent = [];

    for (const content of scrapedContent) {
      try {
        const existingPost = await Post.findOne({
          $or: [
            { sourceUrl: content.url },
            { originalId: content.id, platform: content.platform },
          ],
        });

        if (existingPost) {
          console.log(`⏭️ Duplicate content found, skipping: ${content.id}`);
          continue;
        }

        const isAuthentic =
          await this.contentValidator.validateAuthenticity(content);
        if (!isAuthentic.valid) {
          console.log(
            `⏭️ Content failed authenticity check: ${isAuthentic.reason}`
          );
          continue;
        }

        const qualityScore =
          this.contentProcessor.calculateQualityScore(content);

        const minQualityScore =
          community.scrapingConfig?.qualityThreshold || 0.6;
        if (qualityScore < minQualityScore) {
          console.log(
            `⏭️ Content quality too low (${qualityScore}), skipping...`
          );
          continue;
        }

        authenticContent.push({
          ...content,
          qualityScore,
          authenticityScore: isAuthentic.score,
        });

        if (authenticContent.length >= maxPosts) break;
      } catch (error) {
        console.error(
          `❌ Error validating content ${content.id}:`,
          error.message
        );
      }
    }

    console.log(
      `✅ Validated ${authenticContent.length} authentic post(s) out of ${scrapedContent.length} scraped`
    );
    return authenticContent;
  }

  // --- creation -------------------------------------------------------------

  async createPostsFromAuthenticContent(
    authenticContent,
    community,
    platform,
    users
  ) {
    let postsCreated = 0;
    let skippedExisting = 0;
    let skippedLowQuality = 0;
    const createdItems = [];

    for (const content of authenticContent) {
      try {
        const exists = await Post.exists({
          $or: [
            { platform, originalId: content.id },
            { sourceUrl: content.url },
          ],
        });
        if (exists) {
          skippedExisting++;
          continue;
        }

        const randomUser = users[Math.floor(Math.random() * users.length)];
        const processedContent =
          this.contentProcessor.processAuthenticContent(content);
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
            comments: 0,
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
        createdItems.push(content);
        console.log(
          `✅ Created authentic post: ${post.title.substring(0, 50)}...`
        );
        await autoLikeService.assignInitialLikesToPost(post._id);
      } catch (postError) {
        console.error(
          `❌ Error creating post from ${content.id}:`,
          postError.message
        );
      }
    }

    if (skippedExisting)
      console.log(`⏭️ Skipped ${skippedExisting} existing post(s).`);
    if (skippedLowQuality)
      console.log(`⏭️ Skipped ${skippedLowQuality} low-quality post(s).`);

    return { postsCreated, createdItems, skippedExisting, skippedLowQuality };
  }

  async createPostsFromScrapedContent(
    scrapedContent,
    community,
    platform,
    platformUsers
  ) {
    let postsCreated = 0;
    let skippedExisting = 0;
    let skippedLowQuality = 0;
    const createdItems = [];

    for (const content of scrapedContent) {
      try {
        const existingPost = await Post.findOne({
          $or: [
            { platform, originalId: content.id },
            { sourceUrl: content.url },
          ],
        });

        if (existingPost) {
          skippedExisting++;
          continue;
        }

        const qualityScore =
          this.contentProcessor.calculateQualityScore(content);
        if (
          qualityScore < (community.scrapingConfig?.qualityThreshold || 0.5)
        ) {
          skippedLowQuality++;
          continue;
        }

        const randomUser =
          platformUsers[Math.floor(Math.random() * platformUsers.length)];
        const processedContent = this.contentProcessor.processContent(content);
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
            comments: 0,
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
        createdItems.push(content);
        console.log(`✅ Created post: ${post.title.substring(0, 50)}...`);
        await autoLikeService.assignInitialLikesToPost(post._id);
      } catch (postError) {
        console.error(
          `❌ Error creating post from ${content.id}:`,
          postError.message
        );
      }
    }

    if (skippedExisting)
      console.log(`⏭️ Skipped ${skippedExisting} existing post(s).`);
    if (skippedLowQuality)
      console.log(`⏭️ Skipped ${skippedLowQuality} low-quality post(s).`);

    return { postsCreated, createdItems, skippedExisting, skippedLowQuality };
  }

  // --- stats / cleanup (logs fixed only) -----------------------------------

  async getScrapingStats() {
    const stats = await Post.aggregate([
      {
        $match: {
          "scrapingMetadata.scrapedAt": {
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000),
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

  async cleanupPosts(options = {}) {
    const {
      olderThanDays = 30,
      minQualityScore = 0.3,
      maxPostsPerCommunity = 1000,
    } = options;

    const cutoffDate = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000
    );

    const hiddenResult = await Post.updateMany(
      {
        createdAt: { $lt: cutoffDate },
        "scrapingMetadata.qualityScore": { $lt: minQualityScore },
        status: "active",
      },
      { status: "hidden" }
    );

    console.log(
      `🧹 Hidden ${hiddenResult.modifiedCount} old, low-quality posts`
    );

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
          `🧹 Hidden ${excessPosts.length} excess posts from ${community.name}`
        );
      }
    }

    return {
      hiddenLowQuality: hiddenResult.modifiedCount,
    };
  }
}

export { ScraperManager };
