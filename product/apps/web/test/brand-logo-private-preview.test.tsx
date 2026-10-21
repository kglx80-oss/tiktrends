import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { BrandGuidelines } from '../components/BrandGuidelines';
it('aperçu protégé du logo sans remplacer la valeur du formulaire', () => {
  const canonical = 'https://s3.test/b/assets/workspace/logo.png';
  const preview = '/api/brands/brand/media?url=canonical';
  const html = renderToStaticMarkup(<BrandGuidelines displayUrls={{ [canonical]: preview }} logos={[canonical]} defaultLogo={canonical} colors={[]} fonts={[]} onLogos={() => {}} onDefaultLogo={() => {}} onColors={() => {}} onFonts={() => {}} />);
  expect(html).toContain(`src="${preview}"`);
  expect(html).toContain(`name="logoUrl" value="${canonical}"`);
  expect(html).toContain(`name="logos" value="${canonical}"`);
  expect(html).not.toContain('blob:');
  expect(html).not.toContain('X-Amz-Signature');
});
