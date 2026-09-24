/* ads-config.js — the single place advertising is configured.
 *
 * Nothing else in the codebase should reference a Google publisher ID or
 * slot ID directly; everything reads it from here. Leave ENABLED false
 * until the real values below are filled in -- with it false, no AdSense
 * script is ever requested and the app behaves exactly as it does today.
 */
export const ADS_CONFIG = {
  // Flip to true only once the values below are real. This is the one
  // switch that turns advertising on for the whole app.
  ENABLED: false,

  // From AdSense: Account -> Settings -> Account information.
  // Looks like "ca-pub-XXXXXXXXXXXXXXXX".
  PUBLISHER_ID: 'YOUR_ADSENSE_PUBLISHER_ID',

  // One ad unit per reserved slot, created in AdSense -> Ads -> By ad unit.
  // Each is a "data-ad-slot" value, a string of digits.
  SLOTS: {
    home: 'YOUR_AD_SLOT_ID_HOME',
    library: 'YOUR_AD_SLOT_ID_LIBRARY',
    'reader-footnote': 'YOUR_AD_SLOT_ID_READER_FOOTNOTE',
  },

  // 'production' loads the real AdSense script. 'test' renders the slot
  // frames with a visible placeholder label instead, so the layout and
  // consent gating can be checked without making any real ad request.
  ENVIRONMENT: 'test',
};

export const isConfigured = () =>
  ADS_CONFIG.PUBLISHER_ID !== 'YOUR_ADSENSE_PUBLISHER_ID'
  && Object.values(ADS_CONFIG.SLOTS).every((id) => !id.startsWith('YOUR_AD_SLOT_ID'));
