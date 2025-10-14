import axios from "axios";
import { ScrapingUtils } from "../utils/ScrapingUtils.js";

class RedditScraper {
  constructor() {
    this.baseUrl = "https://www.reddit.com"; // Web base used for canonical URLs
    this.apiBaseUrl = "https://oauth.reddit.com";
    this.authUrl = "https://www.reddit.com/api/v1/access_token";
    this.utils = new ScrapingUtils();
    this.rateLimitDelay = 2000; // 2 seconds between requests
    this.userAgent =
      process.env.REDDIT_USER_AGENT ||
      "EarnCoreCommunityBot/1.0 (by /u/EarnCoreCommunityBot)";
    this.clientId = process.env.REDDIT_CLIENT_ID;
    this.clientSecret = process.env.REDDIT_CLIENT_SECRET;
    this.refreshToken = process.env.REDDIT_REFRESH_TOKEN;
    this.accessToken = null;
    this.tokenExpiresAt = 0;
    this.tokenRequestPromise = null;
  }

  /**
   * Check that Reddit OAuth credentials are configured
   */
  isAuthConfigured() {
    return (
      Boolean(this.clientId) &&
      Boolean(this.clientSecret) &&
      Boolean(this.refreshToken)
    );
  }

  /**
   * Retrieve (and cache) an OAuth access token using the provided refresh token
   */
  async getAccessToken() {
    if (
      this.accessToken &&
      Date.now() < this.tokenExpiresAt - 60 * 1000 // Refresh 1 minute early
    ) {
      return this.accessToken;
    }

    if (this.tokenRequestPromise) {
      return this.tokenRequestPromise;
    }

    if (!this.isAuthConfigured()) {
      throw new Error(
        "Missing Reddit OAuth credentials. Please set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, and REDDIT_REFRESH_TOKEN."
      );
    }

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("refresh_token", this.refreshToken);

    const basicAuth = Buffer.from(
      `${this.clientId}:${this.clientSecret}`
    ).toString("base64");

    this.tokenRequestPromise = axios
      .post(this.authUrl, params.toString(), {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": this.userAgent,
        },
        timeout: 10000,
      })
      .then((response) => {
        const accessToken = response.data?.access_token;
        const expiresIn = response.data?.expires_in ?? 3600;

        if (!accessToken) {
          throw new Error("Reddit did not return an access token");
        }

        this.accessToken = accessToken;
        this.tokenExpiresAt = Date.now() + Math.max(expiresIn - 60, 60) * 1000;
        return this.accessToken;
      })
      .catch((error) => {
        const message =
          error.response?.data?.error_description ||
          error.response?.data?.message ||
          error.message;
        throw new Error(`Failed to refresh Reddit access token: ${message}`);
      })
      .finally(() => {
        this.tokenRequestPromise = null;
      });

    return this.tokenRequestPromise;
  }

  /**
   * Helper to perform authorized GET requests against Reddit API
   */
  async authorizedGet(path, options = {}) {
    const token = await this.getAccessToken();

    const headers = {
      Authorization: `Bearer ${token}`,
      "User-Agent": this.userAgent,
      ...options.headers,
    };

    const requestConfig = {
      ...options,
      headers,
      timeout: options.timeout || 10000,
    };

    const url = path.startsWith("http")
      ? path
      : `${this.apiBaseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

    return axios.get(url, requestConfig);
  }

  /**
   * Scrape real content from Reddit API
   */
  async scrapeContent(config) {
    const {
      sourceUrl,
      keywords = [],
      maxPosts = 50,
      authenticityMode = true,
      sort = "hot",
      excludeStickied = false,
      minCreatedUtc,
    } = config;

    try {
      console.log(`[reddit] Scraping content from ${sourceUrl} (sort=${sort})`);

      const subreddit = this.extractSubreddit(sourceUrl);
      if (!subreddit) {
        throw new Error("Invalid Reddit URL - could not extract subreddit");
      }

      const { posts } = await this.fetchRedditPosts(subreddit, {
        limit: maxPosts,
        sort,
        excludeStickied,
        minCreatedUtc,
      });

      const filteredPosts =
        keywords.length > 0
          ? posts.filter((post) => this.matchesKeywords(post, keywords))
          : posts;

      console.log(
        `[reddit] Retrieved ${filteredPosts.length} posts from r/${subreddit}`
      );
      return filteredPosts.slice(0, maxPosts);
    } catch (error) {
      console.error("Reddit scraping error:", error.message);
      throw new Error(`Reddit scraping failed: ${error.message}`);
    }
  }

  /**
   * Scrape comments for a specific post
   */
  async scrapePostComments(postId, maxComments = 10) {
    try {
      const response = await this.authorizedGet(`/comments/${postId}`, {
        params: { raw_json: 1, limit: maxComments },
        timeout: 15000,
      });

      if (
        !response.data ||
        !Array.isArray(response.data) ||
        response.data.length < 2
      ) {
        return [];
      }

      // Reddit returns [post_data, comments_data]
      const commentsData = response.data[1];
      if (!commentsData?.data?.children) {
        return [];
      }

      return commentsData.data.children
        .filter(
          (child) =>
            child.data && child.data.body && child.data.body !== "[deleted]"
        )
        .map((child) => this.transformRedditComment(child.data))
        .slice(0, maxComments);
    } catch (error) {
      if (error.response?.status === 429) {
        console.log("Rate limited, waiting longer...");
        await this.utils.delay(10000);
        return this.scrapePostComments(postId, maxComments);
      }

      console.error(
        `Error scraping comments for post ${postId}:`,
        error.message
      );
      return [];
    }
  }

  /**
   * Transform Reddit comment data
   */
  transformRedditComment(redditComment) {
    return {
      id: redditComment.id,
      content: redditComment.body,
      author: redditComment.author,
      createdAt: new Date(redditComment.created_utc * 1000),
      likes: redditComment.ups || 0,
      parentId: redditComment.parent_id,
      platform: "reddit",
    };
  }

  /**
   * Fetch posts from Reddit API
   */
  async fetchRedditPosts(
    subreddit,
    {
      limit = 25,
      sort = "hot",
      excludeStickied = false,
      minCreatedUtc,
      after = null,
    } = {}
  ) {
    const posts = [];
    let nextAfter = after;
    let reachedOlderThanMin = false;
    const normalizedSort = ["hot", "new", "top", "rising"].includes(sort)
      ? sort
      : "hot";

    try {
      while (posts.length < limit && !reachedOlderThanMin) {
        const remaining = limit - posts.length;
        const params = {
          limit: Math.min(remaining, 25),
          raw_json: 1,
        };

        if (nextAfter) {
          params.after = nextAfter;
        }

        const response = await this.authorizedGet(
          `/r/${subreddit}/${normalizedSort}`,
          {
            params,
            timeout: 10000,
          }
        );

        const children = response.data?.data?.children || [];
        if (children.length === 0) {
          break;
        }

        for (const child of children) {
          if (!child?.data) continue;
          if (excludeStickied && child.data.stickied) {
            continue;
          }

          if (minCreatedUtc && child.data.created_utc <= minCreatedUtc) {
            reachedOlderThanMin = true;
            continue;
          }

          posts.push(this.transformRedditPost(child.data));
          if (posts.length >= limit) {
            break;
          }
        }

        nextAfter = response.data?.data?.after;
        if (!nextAfter) {
          break;
        }

        await this.utils.delay(this.rateLimitDelay);
      }

      return { posts, nextAfter };
    } catch (error) {
      if (error.response?.status === 429) {
        console.log("Rate limited, waiting longer...");
        await this.utils.delay(5000);
        return this.fetchRedditPosts(subreddit, {
          limit,
          sort,
          excludeStickied,
          minCreatedUtc,
          after: nextAfter,
        });
      }

      throw error;
    }
  }

  /**
   * Transform Reddit post data to our standard format
   */
  transformRedditPost(redditPost) {
    // Generate more dynamic, unique content
    const dynamicTitle = this.enhanceTitle(redditPost.title);
    const dynamicContent = this.enhanceContent(
      redditPost.selftext || redditPost.title,
      redditPost
    );

    return {
      id: redditPost.id,
      title: dynamicTitle,
      content: dynamicContent,
      url: `${this.baseUrl}${redditPost.permalink}`,
      author: redditPost.author,
      createdAt: new Date(redditPost.created_utc * 1000),
      likes: redditPost.ups || 0,
      comments: 0, // Remove original comment count
      shares: redditPost.num_crossposts || 0,
      views: 0, // Reddit doesn't provide view counts
      thumbnail: this.extractThumbnail(redditPost),
      mediaUrls: this.extractMediaUrls(redditPost),
      tags: this.extractTags(redditPost),
      platform: "reddit",
      subreddit: redditPost.subreddit,
      score: redditPost.score || 0,
      upvoteRatio: redditPost.upvote_ratio || 0,
    };
  }

  /**
   * Enhance title to make it more unique and engaging
   */
  enhanceTitle(originalTitle) {
    if (!originalTitle) return "Discussion Post";

    // Remove common Reddit prefixes that make posts look similar
    let enhanced = originalTitle
      .replace(/^(PSA:|LPT:|TIL:|DAE:|TIFU:|AMA:?)\s*/i, "")
      .replace(/^\[.*?\]\s*/, "") // Remove bracketed prefixes
      .trim();

    // Ensure title is not empty after cleaning
    if (!enhanced) {
      enhanced = originalTitle;
    }

    return enhanced;
  }

  /**
   * Enhance content to be more dynamic and unique
   */
  enhanceContent(originalContent, postData) {
    if (!originalContent || originalContent.trim() === "") {
      // Create content from title and context if no selftext
      return this.generateContentFromContext(postData);
    }

    // Clean up the content
    let enhanced = originalContent
      .replace(/Edit:.*$/gim, "") // Remove edit notes
      .replace(/Update:.*$/gim, "") // Remove update notes
      .replace(/TL;DR:.*$/gim, "") // Remove TL;DR
      .replace(/^\s*EDIT\s*:.*$/gim, "") // Remove EDIT lines
      .trim();

    // If content is too short, enhance it
    if (enhanced.length < 50) {
      enhanced = this.expandShortContent(enhanced, postData);
    }

    return enhanced || originalContent;
  }

  /**
   * Generate content from post context when selftext is empty
   */
  generateContentFromContext(postData) {
    const subreddit = postData.subreddit;
    const title = postData.title;

    // Create contextual content based on subreddit and title
    const contextualPhrases = {
      entrepreneur:
        "Looking for insights and experiences from fellow entrepreneurs.",
      business: "Seeking advice and perspectives from the business community.",
      startups: "Would love to hear thoughts from other startup founders.",
      smallbusiness:
        "Any other small business owners have similar experiences?",
      marketing:
        "Interested in hearing different marketing approaches to this.",
      investing:
        "What are your thoughts on this from an investment perspective?",
    };

    const defaultPhrase = "What are your thoughts and experiences with this?";
    const contextPhrase =
      contextualPhrases[subreddit.toLowerCase()] || defaultPhrase;

    return `${title}\n\n${contextPhrase}`;
  }

  /**
   * Expand short content to make it more substantial
   */
  expandShortContent(content, postData) {
    if (content.length >= 50) return content;

    const expansions = [
      "I've been thinking about this lately and wanted to get the community's perspective.",
      "This has been on my mind and I'd love to hear different viewpoints.",
      "I'm curious about others' experiences with this topic.",
      "Looking for insights from people who might have dealt with something similar.",
    ];

    const randomExpansion =
      expansions[Math.floor(Math.random() * expansions.length)];
    return `${content}\n\n${randomExpansion}`;
  }
  /**
   * Extract subreddit name from URL
   */
  extractSubreddit(url) {
    const match = url.match(/\/r\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  /**
   * Extract thumbnail URL
   */
  extractThumbnail(post) {
    if (
      post.thumbnail &&
      post.thumbnail !== "self" &&
      post.thumbnail !== "default"
    ) {
      return post.thumbnail;
    }

    if (post.preview?.images?.[0]?.source?.url) {
      return post.preview.images[0].source.url.replace(/&amp;/g, "&");
    }

    return null;
  }

  /**
   * Extract media URLs
   */
  extractMediaUrls(post) {
    const mediaUrls = [];

    // Image posts
    if (post.url && this.utils.isImageUrl(post.url)) {
      mediaUrls.push({
        type: "image",
        url: post.url,
      });
    }

    // Video posts
    if (post.is_video && post.media?.reddit_video?.fallback_url) {
      mediaUrls.push({
        type: "video",
        url: post.media.reddit_video.fallback_url,
      });
    }

    // Gallery posts
    if (post.is_gallery && post.media_metadata) {
      Object.values(post.media_metadata).forEach((media) => {
        if (media.s?.u) {
          mediaUrls.push({
            type: "image",
            url: media.s.u.replace(/&amp;/g, "&"),
          });
        }
      });
    }

    return mediaUrls;
  }

  /**
   * Extract tags from post
   */
  extractTags(post) {
    const tags = [];

    // Add subreddit as tag
    if (post.subreddit) {
      tags.push(post.subreddit.toLowerCase());
    }

    // Add flair as tag
    if (post.link_flair_text) {
      tags.push(post.link_flair_text.toLowerCase());
    }

    // Extract hashtags from title and content
    const text = `${post.title} ${post.selftext || ""}`;
    const hashtags = text.match(/#\w+/g);
    if (hashtags) {
      tags.push(...hashtags.map((tag) => tag.toLowerCase().substring(1)));
    }

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Check if post matches keywords
   */
  matchesKeywords(post, keywords) {
    const searchText =
      `${post.title} ${post.content} ${post.tags.join(" ")}`.toLowerCase();

    return keywords.some((keyword) =>
      searchText.includes(keyword.toLowerCase())
    );
  }

  /**
   * Get subreddit information
   */
  async getSubredditInfo(subreddit) {
    try {
      const response = await this.authorizedGet(`/r/${subreddit}/about`, {
        params: { raw_json: 1 },
      });

      const data = response.data.data;
      return {
        name: data.display_name,
        title: data.title,
        description: data.public_description,
        subscribers: data.subscribers,
        created: new Date(data.created_utc * 1000),
        isActive: !data.quarantine && data.subreddit_type === "public",
      };
    } catch (error) {
      console.error(
        `Error fetching subreddit info for r/${subreddit}:`,
        error.message
      );
      return null;
    }
  }
}

export { RedditScraper };
