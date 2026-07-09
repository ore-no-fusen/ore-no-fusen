'use client';

import { useEffect } from 'react';
import type React from 'react';
import { trackDonationEvent } from '@/app/utils/analytics';

type DonationPageTrackerProps = {
  page: 'endroll' | 'about_donation';
};

export function DonationPageTracker({ page }: DonationPageTrackerProps) {
  useEffect(() => {
    trackDonationEvent('donation_page_view', {
      donation_page: page,
    });
  }, [page]);

  return null;
}

type DonationCheckoutLinkProps = {
  href: string;
  children: React.ReactNode;
  className?: string;
  source: string;
};

export function DonationCheckoutLink({
  href,
  children,
  className,
  source,
}: DonationCheckoutLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      onClick={() => {
        trackDonationEvent('donation_checkout_click', {
          donation_source: source,
          checkout_provider: 'stripe',
        });
      }}
    >
      {children}
    </a>
  );
}
