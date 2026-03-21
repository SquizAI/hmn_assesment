import fs from 'fs';
import path from 'path';

const replacements = [
  {
    file: 'src/pages/AdminAssessmentsPage.tsx',
    rules: [
      { from: 'bg-[#12121a]', to: 'bg-card' },
      { from: 'bg-[#0e0e16]', to: 'bg-card' }
    ]
  },
  {
    file: 'src/pages/AdminContactsPage.tsx',
    rules: [{ from: 'className="bg-[#12121a]"', to: 'className="bg-card"' }]
  },
  {
    file: 'src/pages/AdminCallsPage.tsx',
    rules: [{ from: 'className="bg-[#12121a]"', to: 'className="bg-card"' }]
  },
  {
    file: 'src/pages/AdminSessionsPage.tsx',
    rules: [
      { from: 'bg-[#12121a]', to: 'bg-card' },
      { from: 'bg-[#1a1a2e] border border-border text-foreground', to: 'bg-foreground text-background shadow-lg' }
    ]
  },
  {
    file: 'src/pages/AdminCompaniesPage.tsx',
    rules: [
      { from: 'bg-[#1a1a2e] border border-border text-foreground', to: 'bg-foreground text-background shadow-lg' }
    ]
  },
  {
    file: 'src/pages/AdminInvitationsPage.tsx',
    rules: [
      { from: 'bg-[#12121a]', to: 'bg-card' },
      { from: 'bg-[#0e0e16]', to: 'bg-card' }
    ]
  },
  {
    file: 'src/components/interview/VapiVoiceAgent.tsx',
    rules: [{ from: 'bg-[#12121a]/95', to: 'bg-card/95' }]
  },
  {
    file: 'src/components/admin/CsvUploadModal.tsx',
    rules: [{ from: 'bg-[#0e0e16]', to: 'bg-card' }]
  },
  {
    file: 'src/components/ui/ConfirmDialog.tsx',
    rules: [{ from: 'bg-[#12121a]', to: 'bg-card' }]
  },
  {
    file: 'src/components/admin/AddCompanyModal.tsx',
    rules: [{ from: 'bg-[#0d0d1a]', to: 'bg-card' }]
  },
  {
    file: 'src/components/admin/AssessmentDrawer.tsx',
    rules: [
      { from: 'bg-[#141420]', to: 'bg-card' },
      { from: 'bg-[#111118]', to: 'bg-card' }
    ]
  },
  {
    file: 'src/components/admin/QuestionEditPopover.tsx',
    rules: [{ from: 'bg-[#141420]', to: 'bg-card' }]
  }
];

for (const { file, rules } of replacements) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) continue;
  let content = fs.readFileSync(p, 'utf8');
  for (const rule of rules) {
    content = content.split(rule.from).join(rule.to);
  }
  fs.writeFileSync(p, content, 'utf8');
  console.log(`Updated ${file}`);
}
