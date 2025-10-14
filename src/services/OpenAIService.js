import OpenAI from "openai";

class OpenAIService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
    this.rateLimitDelay = 1000; // 1 second between requests
    this.lastRequestTime = 0;
  }

  /**
   * Generate realistic comments for a post using OpenAI
   */
  async generateComments(postTitle, postContent, commentCount = 12) {
    try {
      await this.enforceRateLimit();

      const prompt = this.buildCommentPrompt(
        postTitle,
        postContent,
        commentCount
      );

      const response = await this.openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that generates realistic, diverse comments for social media posts. Generate comments that feel authentic and varied in tone, length, and perspective.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        max_tokens: 800,
        temperature: 0.8,
        presence_penalty: 0.6,
        frequency_penalty: 0.3,
      });

      const generatedText = response.choices[0]?.message?.content;
      if (!generatedText) {
        throw new Error("No content generated from OpenAI");
      }

      return this.parseComments(generatedText);
    } catch (error) {
      console.error("Error generating comments with OpenAI:", error.message);

      // Fallback to basic comments if OpenAI fails
      return this.generateFallbackComments(commentCount);
    }
  }

  /**
   * Build optimized prompt for comment generation
   */
  buildCommentPrompt(title, content, count) {
    // Truncate content to save tokens
    const truncatedContent =
      content.length > 300 ? content.substring(0, 300) + "..." : content;

    return `Generate ${count} realistic, diverse comments for this post:

Title: "${title}"
Content: "${truncatedContent}"

Requirements:
- Mix of short (5-15 words) and medium (15-40 words) comments
- Varied perspectives: supportive, questioning, sharing experiences, adding insights
- Natural language, no formal tone
- Include some with questions, some with personal anecdotes
- No promotional content or spam
- Format as numbered list (1. Comment text)

Generate ${count} comments:`;
  }

  /**
   * Parse generated comments from OpenAI response
   */
  parseComments(generatedText) {
    const comments = [];
    const lines = generatedText.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      // Match numbered list format: "1. Comment text" or "1) Comment text"
      const match = line.match(/^\d+[\.\)]\s*(.+)$/);
      if (match && match[1]) {
        const comment = match[1].trim();
        if (comment.length > 10 && comment.length < 500) {
          comments.push(comment);
        }
      }
    }

    return comments.slice(0, 15); // Limit to max 15 comments
  }

  /**
   * Generate fallback comments if OpenAI fails
   */
  generateFallbackComments(count) {
    const fallbackComments = [
      "Thanks for sharing this!",
      "Really interesting perspective.",
      "I've had similar experiences.",
      "Great insights here.",
      "This is really helpful.",
      "Couldn't agree more.",
      "Thanks for the detailed explanation.",
      "This makes a lot of sense.",
      "Appreciate you sharing your thoughts.",
      "Really valuable information.",
      "I learned something new today.",
      "This is exactly what I needed to read.",
      "Well said!",
      "Thanks for the reminder.",
      "This resonates with me.",
    ];

    return fallbackComments
      .sort(() => 0.5 - Math.random())
      .slice(0, Math.min(count, fallbackComments.length));
  }

  /**
   * Enforce rate limiting for API calls
   */
  async enforceRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < this.rateLimitDelay) {
      const waitTime = this.rateLimitDelay - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    this.lastRequestTime = Date.now();
  }

  /**
   * Batch generate comments for multiple posts (more efficient)
   */
  async generateCommentsForPosts(posts) {
    const results = [];

    for (const post of posts) {
      try {
        const comments = await this.generateComments(
          post.title,
          post.content,
          Math.floor(Math.random() * 6) + 10 // 10-15 comments
        );

        results.push({
          postId: post._id,
          comments: comments,
        });

        console.log(
          `Generated ${comments.length} comments for post: ${post.title.substring(0, 50)}...`
        );
      } catch (error) {
        console.error(
          `Failed to generate comments for post ${post._id}:`,
          error.message
        );
        results.push({
          postId: post._id,
          comments: [],
        });
      }
    }

    return results;
  }
}

export { OpenAIService };
