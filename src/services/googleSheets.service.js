import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.auth = null;
    this.spreadsheetId = process.env.GOOGLE_SHEETS_ID;
    // CHANGE 1: Remove spaces from sheet name or ensure it matches exactly
    this.sheetName = process.env.GOOGLE_SHEETS_NAME || "NewsletterSubscribers";
  }

  async initialize() {
    try {
      // Initialize Google Sheets API with service account
      this.auth = new google.auth.GoogleAuth({
        credentials: {
          type: "service_account",
          project_id: process.env.GOOGLE_PROJECT_ID,
          private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
          private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
          client_email: process.env.GOOGLE_CLIENT_EMAIL,
          client_id: process.env.GOOGLE_CLIENT_ID,
          auth_uri: "https://accounts.google.com/o/oauth2/auth",
          token_uri: "https://oauth2.googleapis.com/token",
        },
        scopes: ["https://www.googleapis.com/auth/spreadsheets"],
      });

      const authClient = await this.auth.getClient();
      this.sheets = google.sheets({ version: "v4", auth: authClient });

      // CHANGE 2: Better error handling for sheet initialization
      await this.ensureSheetExists();
      await this.initializeHeaders();

      return true;
    } catch (error) {
      console.error("Error initializing Google Sheets:", error);
      return false;
    }
  }

  // CHANGE 3: Add method to ensure sheet exists
  async ensureSheetExists() {
    try {
      // Get spreadsheet info to check if sheet exists
      const spreadsheet = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheetExists = spreadsheet.data.sheets.some(
        (sheet) => sheet.properties.title === this.sheetName
      );

      if (!sheetExists) {
        // Create the sheet if it doesn't exist
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: this.sheetName,
                  },
                },
              },
            ],
          },
        });
        console.log(`✅ Created sheet: ${this.sheetName}`);
      }
    } catch (error) {
      console.error("Error ensuring sheet exists:", error);
      throw error;
    }
  }

  async initializeHeaders() {
    try {
      // CHANGE 4: Use proper sheet name quoting for names with spaces
      const range = this.sheetName.includes(" ")
        ? `'${this.sheetName}'!A1:E1`
        : `${this.sheetName}!A1:E1`;

      // Check if headers exist
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: range,
      });

      // If no headers, add them
      if (!response.data.values || response.data.values.length === 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: range,
          valueInputOption: "RAW",
          resource: {
            // Add IP Address column and keep Status at column E
            values: [["Email", "Created At", "Source", "IP Address", "Status"]],
          },
        });
        console.log("✅ Headers initialized");
      }
    } catch (error) {
      console.error("Error initializing headers:", error);
      // CHANGE 5: Don't throw error here, just log it
      // The main functionality should still work even if headers fail
    }
  }

  async addSubscriber(subscriberData) {
    try {
      if (!this.sheets) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error("Failed to initialize Google Sheets");
        }
      }

      const values = [
        [
          subscriberData.email,
          // Expect ISO timestamp string per requirement
          subscriberData.subscribedAt,
          subscriberData.source || "website",
          subscriberData.ipAddress || "",
          "Active",
        ],
      ];

      // CHANGE 6: Use proper sheet name quoting
      const range = this.sheetName.includes(" ")
        ? `'${this.sheetName}'!A:E`
        : `${this.sheetName}!A:E`;

      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: range,
        valueInputOption: "RAW",
        resource: {
          values: values,
        },
      });

      console.log(
        `✅ Added subscriber to Google Sheets: ${subscriberData.email}`
      );
      return true;
    } catch (error) {
      console.error("Error adding subscriber to Google Sheets:", error);
      throw error;
    }
  }

  async updateSubscriber(email, isActive) {
    try {
      if (!this.sheets) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error("Failed to initialize Google Sheets");
        }
      }

      // CHANGE 7: Use proper sheet name quoting
      const range = this.sheetName.includes(" ")
        ? `'${this.sheetName}'!A:E`
        : `${this.sheetName}!A:E`;

      // Get all data to find the row
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: range,
      });

      const rows = response.data.values || [];
      const emailIndex = rows.findIndex(
        (row, index) =>
          index > 0 && row[0]?.toLowerCase() === email.toLowerCase()
      );

      if (emailIndex !== -1) {
        const rowNumber = emailIndex + 1;
        const status = isActive ? "Active" : "Inactive";

        const updateRange = this.sheetName.includes(" ")
          ? `'${this.sheetName}'!E${rowNumber}`
          : `${this.sheetName}!E${rowNumber}`;

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: updateRange,
          valueInputOption: "RAW",
          resource: {
            values: [[status]],
          },
        });

        console.log(
          `✅ Updated subscriber in Google Sheets: ${email} - ${status}`
        );
      }

      return true;
    } catch (error) {
      console.error("Error updating subscriber in Google Sheets:", error);
      throw error;
    }
  }

  async getAllSubscribers() {
    try {
      if (!this.sheets) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error("Failed to initialize Google Sheets");
        }
      }

      // CHANGE 8: Use proper sheet name quoting
      const range = this.sheetName.includes(" ")
        ? `'${this.sheetName}'!A:E`
        : `${this.sheetName}!A:E`;

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: range,
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) return [];

      // Skip header row and convert to objects
      return rows.slice(1).map((row) => ({
        email: row[0] || "",
        subscribedAt: row[1] || "",
        source: row[2] || "",
        status: row[4] || "",
      }));
    } catch (error) {
      console.error("Error getting subscribers from Google Sheets:", error);
      throw error;
    }
  }

  async testConnection() {
    try {
      const initialized = await this.initialize();
      if (!initialized) {
        return { success: false, message: "Failed to initialize" };
      }

      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      return {
        success: true,
        message: "Google Sheets connection successful",
        spreadsheetTitle: response.data.properties.title,
        availableSheets: response.data.sheets.map(
          (sheet) => sheet.properties.title
        ),
      };
    } catch (error) {
      return {
        success: false,
        message: "Google Sheets connection failed",
        error: error.message,
      };
    }
  }
}

export const GoogleSheetsServices = new GoogleSheetsService();
