/**
 * Checks if a user is authorized to access the system based on
 * email whitelist and domain whitelist configuration.
 *
 * If no restrictions are configured (both ALLOWED_EMAILS and ALLOWED_DOMAINS are empty),
 * all users are allowed.
 *
 * @param email - The user's email address
 * @returns true if the user is authorized, false otherwise
 */
export function isUserAuthorized(email: string): boolean {
  const allowedEmails = process.env.ALLOWED_EMAILS || '';
  const allowedDomains = process.env.ALLOWED_DOMAINS || '';

  // If no restrictions are set, allow all users
  if (!allowedEmails && !allowedDomains) {
    return true;
  }

  // Check email whitelist
  if (allowedEmails && isEmailInWhitelist(email, allowedEmails)) {
    return true;
  }

  // Check domain whitelist
  if (allowedDomains && isDomainInWhitelist(email, allowedDomains)) {
    return true;
  }

  return false;
}

/**
 * Checks if an email is in the comma-separated whitelist.
 */
function isEmailInWhitelist(email: string, allowedEmails: string): boolean {
  const emails = allowedEmails.split(',').map(e => e.trim().toLowerCase());
  return emails.includes(email.toLowerCase());
}

/**
 * Checks if an email's domain is in the comma-separated domain whitelist.
 */
function isDomainInWhitelist(email: string, allowedDomains: string): boolean {
  const domains = allowedDomains.split(',').map(d => d.trim().toLowerCase());
  const emailDomain = email.split('@')[1]?.toLowerCase();

  return emailDomain ? domains.includes(emailDomain) : false;
}