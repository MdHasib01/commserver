import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Helper function to generate user data using OpenAI
async function generateUserWithAI() {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Generate realistic user profile data for a US-based user. Create CREATIVE and UNIQUE Reddit-style usernames that are NOT just firstname_number format. 

Examples of good Reddit-style usernames:
- NightOwl_Coder92
- PizzaLover_TX
- BookWorm2024
- TechNinja_420
- CoffeeAddict_Dev
- GamerGirl_Seattle
- MountainHiker_CO
- RetroGamer_90s
- CodeWarrior_NYC
- MusicJunkie_LA

Return ONLY a JSON object with this structure:
{
  "firstName": "string",
  "lastName": "string", 
  "username": "string (creative Reddit-style, NOT firstname_number format, 8-15 chars)",
  "email": "string (realistic email)",
  "age": "number (18-65)",
  "address": {
    "street": "string",
    "city": "string", 
    "state": "string (2-letter code)",
    "zip": "string",
    "country": "USA",
    "timeZone": "string (IANA timezone)"
  },
  "phone": "string (+1 format)",
  "bio": "string (short 1-2 sentence bio)"
}`,
        },
        {
          role: "user",
          content:
            "Generate a realistic US user profile with a creative Reddit-style username",
        },
      ],
      temperature: 0.9,
      max_tokens: 500,
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    throw new Error(`OpenAI API error: ${error.message}`);
  }
}

// Helper function to get avatar URL suggestion using AI
async function getAvatarUrlFromAI(userProfile) {
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are an expert at generating realistic Pexels photo IDs specifically for PEOPLE/PORTRAIT/HEADSHOT images. 

Generate a RANDOM 7-digit number that represents a Pexels photo ID for a human portrait/headshot/people photo.

Focus on photo IDs that would likely contain:
- Professional headshots
- Portrait photography
- People in casual settings
- Business portraits
- Lifestyle photography with people
- Human faces and expressions

IMPORTANT: Return ONLY the 7-digit number - no explanations, no text, no URLs, just the number.

Examples of valid responses: 1239288, 1520760, 2379746, 3456789

Generate a unique number each time that would represent a people/portrait photo on Pexels.`,
        },
        {
          role: "user",
          content: `Generate a unique 7-digit Pexels photo ID for a PEOPLE/PORTRAIT photo suitable for: ${userProfile.firstName} ${userProfile.lastName}, username: ${userProfile.username}`,
        },
      ],
      temperature: 0.9,
      max_tokens: 20,
    });

    let photoId = completion.choices[0].message.content.trim();

    // Clean up the response and validate it's a number
    photoId = photoId.replace(/\D/g, ""); // Remove all non-digits

    // Ensure it's 7 digits
    if (photoId.length < 7) {
      photoId = photoId.padStart(7, "0");
    } else if (photoId.length > 7) {
      photoId = photoId.slice(0, 7);
    }

    // Validate it's a proper number
    if (!/^\d{7}$/.test(photoId)) {
      throw new Error("Invalid photo ID format");
    }

    // Generate Pexels URL with the AI-generated photo ID
    return `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=400`;
  } catch (error) {
    // Fallback: Use curated photo IDs that are known to be people/portrait photos
    const peoplePhotoIds = [
      1239288, // Your example - person
      1520760, // Professional headshot
      2379746, // Portrait
      1065084, // Business portrait
      1181424, // Casual portrait
      1212984, // Headshot
      1300402, // Portrait photo
      1381679, // Professional photo
      1520760, // Business headshot
      1587009, // Portrait
      1681010, // People photo
      1758144, // Portrait
      1844012, // Headshot
      1933873, // Portrait
      2071882, // People
      2182970, // Portrait
      2269872, // Headshot
      2381069, // Portrait
      2422280, // People photo
      2531553, // Portrait
      2625122, // Headshot
      2709388, // Portrait
      2787341, // People
      2813554, // Portrait
      2888150, // Headshot
      2955376, // Portrait
      3094230, // People photo
      3182812, // Portrait
      3211476, // Headshot
      3307758, // Portrait
      3394658, // People
      3475542, // Portrait
    ];

    // Use username hash to ensure same user gets same avatar across requests
    let hash = 0;
    const str = userProfile.username || userProfile.firstName || "default";
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    const photoId = peoplePhotoIds[Math.abs(hash) % peoplePhotoIds.length];
    return `https://images.pexels.com/photos/${photoId}/pexels-photo-${photoId}.jpeg?auto=compress&cs=tinysrgb&w=400`;
  }
}

// Helper function to generate username from name if AI doesn't provide good one
function sanitizeForUsername(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 10);
}

function generateBackupUsername(firstName, lastName) {
  const themes = [
    "Tech",
    "Gaming",
    "Music",
    "Art",
    "Sports",
    "Food",
    "Travel",
    "Books",
    "Movies",
    "Nature",
  ];
  const suffixes = [
    "Pro",
    "Master",
    "Ninja",
    "Guru",
    "Wizard",
    "Legend",
    "Hero",
    "Star",
    "King",
    "Queen",
  ];
  const adjectives = [
    "Epic",
    "Cool",
    "Wild",
    "Dark",
    "Bright",
    "Swift",
    "Bold",
    "Smart",
    "Crazy",
    "Magic",
  ];

  const baseParts = [
    sanitizeForUsername(firstName).slice(0, 4),
    sanitizeForUsername(lastName).slice(0, 4),
  ].filter(Boolean);

  const randomTheme = themes[Math.floor(Math.random() * themes.length)];
  const randomSuffix = suffixes[Math.floor(Math.random() * suffixes.length)];
  const randomAdjective =
    adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNum = Math.floor(10 + Math.random() * 9000);

  const patterns = [
    `${randomAdjective}${randomTheme}${randomNum}`,
    `${baseParts[0] || "User"}${randomTheme}_${randomNum}`,
    `${randomTheme}${randomSuffix}_${randomNum}`,
    `${baseParts.join("")}${randomSuffix}${Math.floor(10 + Math.random() * 90)}`,
    `${randomAdjective}_${baseParts[0] || "Gen"}${randomNum}`,
  ];

  let username = patterns[Math.floor(Math.random() * patterns.length)];

  if (username.length > 15) username = username.slice(0, 15);
  if (username.length < 6)
    username = `${username}_${Math.floor(10 + Math.random() * 90)}`;

  return username;
}

export const generatePlatformUsers = asyncHandler(async (req, res) => {
  const { count } = req.body;

  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new ApiError(400, "Count must be an integer between 1 and 50");
  }

  // Check if OpenAI API key is configured
  if (!process.env.OPENAI_API_KEY) {
    throw new ApiError(500, "OpenAI API key not configured");
  }

  const results = [];
  const saved = [];
  const skipped = [];
  const errors = [];

  for (let i = 0; i < count; i++) {
    try {
      // Generate user data using OpenAI
      const aiUserData = await generateUserWithAI();

      // Validate and clean up the AI-generated data
      const firstName = aiUserData.firstName || "User";
      const lastName = aiUserData.lastName || "Generated";
      let username = aiUserData.username;

      // Validate username format and generate backup if needed
      if (
        !username ||
        username.length < 3 ||
        username.length > 15 ||
        !/^[a-zA-Z0-9_]+$/.test(username)
      ) {
        username = generateBackupUsername(firstName, lastName);
      }

      const email =
        aiUserData.email ||
        `${sanitizeForUsername(firstName)}.${sanitizeForUsername(lastName)}@example.com`;

      // Check if user already exists
      const existing = await User.findOne({ $or: [{ username }, { email }] });
      if (existing) {
        skipped.push(username);
        continue;
      }

      // Get avatar URL from AI
      const avatarUrl = await getAvatarUrlFromAI(aiUserData);

      // Create user with AI-generated data
      const user = await User.create({
        username,
        email,
        fullName: `${firstName} ${lastName}`,
        avatar: avatarUrl,
        userType: "platform",
        password: "password123", // hashed by pre-save hook
        // Additional fields if your model supports them
        ...(aiUserData.age && { age: aiUserData.age }),
        ...(aiUserData.phone && { phone: aiUserData.phone }),
        ...(aiUserData.bio && { bio: aiUserData.bio }),
        ...(aiUserData.address && { address: aiUserData.address }),
      });

      const responseUser = {
        id: user._id,
        username,
        userType: "platform",
        fullName: `${firstName} ${lastName}`,
        email,
        avatarUrl,
        ...(aiUserData.age && { age: aiUserData.age }),
        ...(aiUserData.phone && { phone: aiUserData.phone }),
        ...(aiUserData.bio && { bio: aiUserData.bio }),
        ...(aiUserData.address && { address: aiUserData.address }),
      };

      results.push(responseUser);
      saved.push(username);

      // Add small delay to avoid rate limiting
      if (i < count - 1) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (err) {
      console.error(`Error generating user ${i + 1}:`, err.message);
      errors.push({ index: i + 1, error: err.message });
    }
  }

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        totalRequested: count,
        totalSaved: saved.length,
        totalSkipped: skipped.length,
        totalErrors: errors.length,
        users: results,
        skipped,
        errors,
      },
      `Generated ${saved.length} platform users using AI`
    )
  );
});

// Optional: Generate a single user endpoint for testing
export const generateSingleUser = asyncHandler(async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new ApiError(500, "OpenAI API key not configured");
    }

    const aiUserData = await generateUserWithAI();
    const avatarUrl = await getAvatarUrlFromAI(aiUserData);

    return res.status(200).json(
      new ApiResponse(
        200,
        {
          userData: aiUserData,
          avatarUrl,
        },
        "Generated user data preview"
      )
    );
  } catch (error) {
    throw new ApiError(500, `Failed to generate user: ${error.message}`);
  }
});
