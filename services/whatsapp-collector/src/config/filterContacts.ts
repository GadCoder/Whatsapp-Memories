const CONTACT_ID_REGEX = /(@c\.us|@g\.us|@broadcast)$/;

export interface ParsedFilterContacts {
  validContacts: string[];
  invalidContacts: string[];
}

export function normalizeContactIdentifier(value: string): string {
  return value.trim().toLowerCase();
}

export function parseFilterContacts(rawValue: string | undefined): ParsedFilterContacts {
  const contacts = (rawValue || '')
    .split(',')
    .map((contact) => normalizeContactIdentifier(contact))
    .filter(Boolean);

  const invalidContacts = contacts.filter((contact) => !CONTACT_ID_REGEX.test(contact));
  const validContacts = contacts.filter((contact) => CONTACT_ID_REGEX.test(contact));

  return { validContacts, invalidContacts };
}
