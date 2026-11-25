const FIELD_FLAGS = { phonetic: 1, translation: 2 };

export const isEditedLyricSupplement = (line, field) =>
  (line?.userEditedLyricFields & FIELD_FLAGS[field]) !== 0;

export function setEditedLyricSupplements(line, phonetic, translation) {
  const flags = (phonetic ? FIELD_FLAGS.phonetic : 0) | (translation ? FIELD_FLAGS.translation : 0);
  if (flags) line.userEditedLyricFields = flags;
  else if (line.userEditedLyricFields !== undefined) delete line.userEditedLyricFields;
  return line;
}
