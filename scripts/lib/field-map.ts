/**
 * Maps the Google-Sheet column headers → our form field ids (PIQ config +
 * EOI form), so imported answers render in the portal exactly where the
 * supplier would have typed them. Header matching is by regex (the sheets
 * have trailing spaces / newlines / long parentheticals).
 */

export interface FieldRule {
  id: string;
  re: RegExp;
}

/** PIQ sheet → PIQ config field ids (src/lib/supplier/piq-config.ts). */
export const PIQ_MAP: FieldRule[] = [
  { id: 'product_name', re: /^product name/i },
  { id: 'brand_name', re: /brand name/i },
  { id: 'category', re: /^categories/i },
  { id: 'short_description', re: /short description/i },
  { id: 'long_description', re: /long description/i },
  { id: 'product_image', re: /upload product image/i },
  { id: 'packaging_image', re: /upload packaging image/i },
  { id: 'country_of_origin', re: /country of origin/i },
  { id: 'weight_volume', re: /weight ?\/ ?volume/i },
  { id: 'dimensions', re: /^dimensions/i },
  { id: 'ingredients', re: /ingredients ?\/ ?materials/i },
  { id: 'nutritional_content', re: /nutritional content/i },
  { id: 'contains', re: /^contains/i },
  { id: 'does_not_contain', re: /does not contain/i },
  { id: 'gmo_status', re: /gmo status/i },
  { id: 'shelf_life', re: /shelf life/i },
  { id: 'storage_conditions', re: /storage conditions/i },
  { id: 'has_patent', re: /is there a patent/i },
  { id: 'patent_details', re: /describe the patent/i },
  { id: 'trademark_status', re: /trademarked or copyrighted/i },
  { id: 'how_it_works', re: /how it works/i },
  { id: 'how_to_use', re: /how to use it/i },
  { id: 'how_made', re: /how it is made/i },
  { id: 'what_it_does', re: /what it does/i },
  { id: 'what_it_doesnt', re: /what it doesn/i },
  { id: 'target_users', re: /target users/i },
  { id: 'general_warning', re: /general warning/i },
  { id: 'hazardous_materials', re: /hazardous materials present/i },
  { id: 'cautions', re: /^cautions/i },
  { id: 'allergies', re: /allergies ?\/ ?sensitivities/i },
  { id: 'efficacy_summary', re: /efficacy test results \(summ/i },
  { id: 'efficacy_upload', re: /efficacy test results \(upload/i },
  { id: 'toxicology_upload', re: /toxicology/i },
  { id: 'afcfta_compliant', re: /afcfta compliant/i },
  { id: 'eu_compliant', re: /eudr standard compliant/i },
  { id: 'son_certified', re: /national standards organization/i },
  { id: 'fda_approved', re: /national food and drug/i },
  { id: 'quality_marks', re: /certifications or quality marks/i },
  { id: 'certification_docs', re: /upload certification documents/i },
  { id: 'batch_number', re: /production batch/i },
  { id: 'traceability_statement', re: /traceability statement/i },
  { id: 'sourcing_info', re: /sourcing information/i },
  { id: 'sustainability_claims', re: /sustainability claims/i },
  { id: 'fair_trade', re: /fair trade/i },
  { id: 'bulk_price', re: /bulk price per unit/i },
  { id: 'moq', re: /minimum order quantity/i },
  { id: 'max_capacity', re: /maximum supply capacity/i },
  { id: 'delivery_time', re: /expected delivery time/i },
  { id: 'payment_terms', re: /payment terms/i },
  { id: 'brand_story', re: /brand story/i },
  { id: 'usp', re: /unique selling proposition/i },
  { id: 'comparative_advantage', re: /comparative advantage/i },
  { id: 'competitive_advantage', re: /competitive advantage/i },
  { id: 'is_new', re: /is this product new in the market/i },
  { id: 'time_in_market', re: /how long has it been in the market/i },
  { id: 'where_sold', re: /where else is the product listed/i },
  { id: 'differentiators', re: /key differentiators/i },
  { id: 'target_market', re: /target market/i },
  { id: 'promo_materials', re: /promotional materials/i },
  { id: 'social_handles', re: /social media handles ?\/ ?website/i },
  { id: 'declaration_agree', re: /final declaration/i },
];

/** EOI sheet → EOI form field ids (src/lib/supplier/stage-forms.ts). */
export const EOI_MAP: FieldRule[] = [
  { id: 'business_name', re: /full name of business/i },
  { id: 'contact_name', re: /primary contact person.{0,4}s name/i },
  { id: 'contact_email', re: /email address/i },
  { id: 'contact_phone', re: /phone number/i },
  { id: 'physical_address', re: /physical address/i },
  { id: 'state_country', re: /state & country/i },
  { id: 'web_social', re: /website or social media/i },
  { id: 'business_type', re: /what type of business/i },
  { id: 'product_count', re: /how many products/i },
  { id: 'product_list', re: /list your different type of products/i },
  { id: 'product_images', re: /upload your product images/i },
  { id: 'raw_materials', re: /raw materials/i },
  { id: 'certified', re: /are any of your products certified/i },
  { id: 'accept_packaging_inputs', re: /accept inputs on labeling/i },
  { id: 'attend_clinic', re: /capacity-building clinic/i },
  { id: 'exclusive_line', re: /exclusively made for azm/i },
  { id: 'how_heard', re: /how did you hear/i },
  { id: 'declaration', re: /^declaration/i },
];

/** Map a raw CSV row → { fieldId: value } using the rules (non-empty only). */
export function mapAnswers(
  raw: Record<string, string>,
  cols: string[],
  rules: FieldRule[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    const col = cols.find((c) => rule.re.test(c.trim()));
    if (!col) continue;
    const v = (raw[col] ?? '').toString().trim();
    if (v) out[rule.id] = v;
  }
  // EOI "Are you aware of any of the following: [..]" is 3 columns → fold
  // into a single aware_of list when present.
  const awareCols = cols.filter((c) => /are you aware of any of the following/i.test(c.trim()));
  if (awareCols.length) {
    const aware = awareCols
      .filter((c) => /^(yes|aware|true)/i.test((raw[c] ?? '').trim()))
      .map((c) => {
        const m = c.match(/\[(.+?)\]/);
        return m ? m[1] : c;
      });
    if (aware.length) out['aware_of'] = aware.join(', ');
  }
  return out;
}
