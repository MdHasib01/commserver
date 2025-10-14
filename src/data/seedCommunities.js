import { Community } from "../models/community.model.js";

const communitiesData = [
  {
    name: "Entrepreneurs Hub",
    slug: "entrepreneurs-hub",
    description:
      "A community for entrepreneurs to share insights, experiences, and connect with like-minded individuals.",
    category: "entrepreneurs",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/entrepreneur",
        keywords: ["startup", "business", "entrepreneur", "funding", "growth"],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 25,
      qualityThreshold: 0.6,
    },
  },
  {
    name: "Startup Central",
    slug: "startup-central",
    description:
      "Everything about startups - from ideation to scaling, funding to exit strategies.",
    category: "startups",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/startups",
        keywords: ["startup", "mvp", "funding", "venture capital", "seed"],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 30,
      qualityThreshold: 0.7,
    },
  },
  {
    name: "Small Business Network",
    slug: "small-business-network",
    description:
      "Supporting small business owners with practical advice, resources, and community support.",
    category: "small-business",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/smallbusiness",
        keywords: [
          "small business",
          "local business",
          "operations",
          "customers",
        ],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 20,
      qualityThreshold: 0.5,
    },
  },
  {
    name: "Business Strategy Forum",
    slug: "business-strategy-forum",
    description:
      "Discussing business strategies, market analysis, and corporate decision-making.",
    category: "business-general",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/business",
        keywords: [
          "business strategy",
          "market analysis",
          "management",
          "leadership",
        ],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 25,
      qualityThreshold: 0.6,
    },
  },
  {
    name: "Marketing Masters",
    slug: "marketing-masters",
    description:
      "Digital marketing strategies, campaigns, and growth hacking techniques.",
    category: "marketing",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/marketing",
        keywords: [
          "marketing",
          "digital marketing",
          "seo",
          "social media",
          "advertising",
        ],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 35,
      qualityThreshold: 0.5,
    },
  },
  {
    name: "SaaS Builders",
    slug: "saas-builders",
    description:
      "Community for SaaS entrepreneurs, developers, and business owners.",
    category: "saas-owners",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/SaaS",
        keywords: [
          "saas",
          "software",
          "subscription",
          "recurring revenue",
          "b2b",
        ],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 20,
      qualityThreshold: 0.7,
    },
  },
  {
    name: "E-commerce Excellence",
    slug: "e-commerce-excellence",
    description:
      "Online retail strategies, e-commerce platforms, and digital commerce trends.",
    category: "e-commerce",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/ecommerce",
        keywords: ["ecommerce", "online store", "shopify", "amazon", "retail"],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 25,
      qualityThreshold: 0.6,
    },
  },
  {
    name: "Sales Professionals",
    slug: "sales-professionals",
    description:
      "Sales techniques, customer relationship management, and revenue growth strategies.",
    category: "sales",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/sales",
        keywords: ["sales", "selling", "crm", "leads", "conversion"],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 20,
      qualityThreshold: 0.5,
    },
  },
  {
    name: "Personal Finance Hub",
    slug: "personal-finance-hub",
    description:
      "Personal finance advice, investment strategies, and wealth building tips.",
    category: "personal-finance",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/personalfinance",
        keywords: [
          "personal finance",
          "investing",
          "budgeting",
          "savings",
          "retirement",
        ],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 30,
      qualityThreshold: 0.6,
    },
  },
  {
    name: "Business Ideas Lab",
    slug: "business-ideas-lab",
    description:
      "Innovative business ideas, market opportunities, and entrepreneurial inspiration.",
    category: "business-ideas",
    scrapingPlatforms: [
      {
        platform: "reddit",
        sourceUrl: "https://www.reddit.com/r/businessideas",
        keywords: [
          "business ideas",
          "opportunity",
          "innovation",
          "market gap",
          "startup idea",
        ],
        isActive: true,
      },
    ],
    scrapingConfig: {
      frequency: "daily",
      maxPostsPerScrape: 15,
      qualityThreshold: 0.5,
    },
  },
];

export async function seedCommunities() {
  try {
    console.log("Seeding communities...");

    // Check if communities already exist
    const existingCount = await Community.countDocuments();
    if (existingCount > 0) {
      console.log(
        `Communities already exist (${existingCount} found). Skipping seed.`
      );
      return;
    }

    // Insert communities
    const createdCommunities = await Community.insertMany(communitiesData);
    console.log(
      `✅ Successfully seeded ${createdCommunities.length} communities`
    );

    return createdCommunities;
  } catch (error) {
    console.error("❌ Error seeding communities:", error);
    throw error;
  }
}

export { communitiesData };
