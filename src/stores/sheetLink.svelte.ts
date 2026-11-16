// The Sheet tab's link in the header and the tab bar: the editor hash with
// the current song ('#/sheet?s=1.abc&b=6'), so the song comes back even from
// the syntax guide. The Sheet store (loaded with the Sheet tab) keeps it up
// to date; before that it's the bare '#/sheet', which opens an empty sheet
// offering to continue the last song.

export const sheetLink = $state({ hash: '#/sheet' });
