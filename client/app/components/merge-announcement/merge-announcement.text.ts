// English text for the merge announcement. Same keys and wording as blocks-monitor's
// monitor.shared i18n module; this client has no i18n setup, so the text lives here.
export const MERGE_ANNOUNCEMENT_TEXT = {
  "MERGE_ANNOUNCEMENT.AFTER_FEATURES_TEXT":
    "Workflows, data, translations and monitoring are all in Blocks OS.",
  "MERGE_ANNOUNCEMENT.AFTER_INTRO":
    "Since 28 November 2026, Logic, Data, Localization and Monitor have become part of Blocks OS (os.seliseblocks.com).",
  "MERGE_ANNOUNCEMENT.AFTER_LEAD":
    "Logic, Data, Localization and Monitor are now part of Blocks OS (os.seliseblocks.com).",
  "MERGE_ANNOUNCEMENT.AFTER_LINKS_LEAD": "Old links will work until 20 December, 18:00 UTC.",
  "MERGE_ANNOUNCEMENT.AFTER_LINKS_TEXT":
    "The old Logic, Data, Localization and Monitor addresses are forwarding to the merged Blocks OS. Please update your bookmarks and integrations to os.seliseblocks.com before the cut-off time.",
  "MERGE_ANNOUNCEMENT.AFTER_MIGRATE_TEXT":
    "Your projects, data, workflows and settings stay as they were.",
  "MERGE_ANNOUNCEMENT.AFTER_SHORT":
    "Logic, Data, Localization and Monitor are now in Blocks OS. Old addresses will work until 20 Dec, 18:00 UTC.",
  "MERGE_ANNOUNCEMENT.AFTER_SWITCHER_TEXT":
    "It now shows five apps: Blocks OS, Studio, Release, Utilities and Agents.",
  "MERGE_ANNOUNCEMENT.AFTER_TEXT":
    "Old addresses will forward to Blocks OS until 20 December, 18:00 UTC. Please update your bookmarks and integrations.",
  "MERGE_ANNOUNCEMENT.AFTER_TITLE": "We've brought more of Blocks together in Blocks OS",
  "MERGE_ANNOUNCEMENT.BEFORE_DOWNTIME_LEAD": "Planned downtime:",
  "MERGE_ANNOUNCEMENT.BEFORE_DOWNTIME_TEXT":
    "on 28 November, from 18:00 to 19:00 UTC, Blocks may be unavailable for up to 1 hour.",
  "MERGE_ANNOUNCEMENT.BEFORE_FEATURES_LEAD": "Same features, one place.",
  "MERGE_ANNOUNCEMENT.BEFORE_FEATURES_TEXT":
    "Workflows, data, translations and monitoring will all be in Blocks OS.",
  "MERGE_ANNOUNCEMENT.BEFORE_INTRO":
    "On 28 November 2026, Logic, Data, Localization and Monitor will become part of Blocks OS (os.seliseblocks.com).",
  "MERGE_ANNOUNCEMENT.BEFORE_LEAD": "Blocks is getting simpler.",
  "MERGE_ANNOUNCEMENT.BEFORE_LINKS_LEAD":
    "Old links will keep working until 20 December, 18:00 UTC.",
  "MERGE_ANNOUNCEMENT.BEFORE_LINKS_TEXT":
    "The old Logic, Data, Localization and Monitor addresses will forward to the merged Blocks OS until then. Please update your bookmarks and integrations to os.seliseblocks.com before the cut-off time.",
  "MERGE_ANNOUNCEMENT.BEFORE_MIGRATE_LEAD": "Nothing to migrate.",
  "MERGE_ANNOUNCEMENT.BEFORE_MIGRATE_TEXT":
    "Your projects, data, workflows and settings will stay as they are.",
  "MERGE_ANNOUNCEMENT.BEFORE_SHORT":
    "Logic, Data, Localization and Monitor will move into Blocks OS on 28 Nov. Downtime 18:00–19:00 UTC.",
  "MERGE_ANNOUNCEMENT.BEFORE_SWITCHER_LEAD": "A simpler app switcher.",
  "MERGE_ANNOUNCEMENT.BEFORE_SWITCHER_TEXT":
    "It will show five apps: Blocks OS, Studio, Release, Utilities and Agents.",
  "MERGE_ANNOUNCEMENT.BEFORE_TEXT":
    "On 28 November, Logic, Data, Localization and Monitor will move into Blocks OS (os.seliseblocks.com). Expect up to 1 hour of downtime from 18:00 to 19:00 UTC. Your work will stay as it is.",
  "MERGE_ANNOUNCEMENT.BEFORE_TITLE": "We're bringing more of Blocks together in Blocks OS",
  "MERGE_ANNOUNCEMENT.DETAILS_CONTACT": "Questions? Please contact the Blocks team.",
  "MERGE_ANNOUNCEMENT.DETAILS_GOT_IT": "Got it",
  "MERGE_ANNOUNCEMENT.DETAILS_HEADING": "What this means for you",
  "MERGE_ANNOUNCEMENT.DISMISS": "Dismiss announcement",
  "MERGE_ANNOUNCEMENT.LEARN_MORE": "Learn more",
  "MERGE_ANNOUNCEMENT.REGION_LABEL": "Announcement",
} as const;

export type MergeAnnouncementKey = keyof typeof MERGE_ANNOUNCEMENT_TEXT;

export const t = (key: MergeAnnouncementKey): string => MERGE_ANNOUNCEMENT_TEXT[key];
