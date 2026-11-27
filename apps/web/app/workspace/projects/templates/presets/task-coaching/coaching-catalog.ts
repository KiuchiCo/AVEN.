// Which tasks each starter template coaches, in order, and the name the coaching text uses for the template.
export const coachingCatalog: Record<string, { name: string; tasks: string[] }> = {
 "product": {
  "name": "Product roadmap",
  "tasks": [
   "Review strategy and planning horizon",
   "Collect customer evidence and requests",
   "Rank opportunities against criteria",
   "Map dependencies and team capacity",
   "Publish proposed roadmap and risks",
   "Review outcomes and update priorities"
  ]
 },
 "feature-delivery": {
  "name": "Feature delivery",
  "tasks": [
   "Confirm user problem and scope",
   "Write acceptance criteria and edge cases",
   "Design accessible interaction flows",
   "Implement capability behind safe rollout",
   "Run quality and accessibility checks",
   "Release, monitor, and capture feedback"
  ]
 },
 "bug-triage": {
  "name": "Bug triage",
  "tasks": [
   "Capture report and impact",
   "Reproduce issue in supported environments",
   "Assess severity and affected users",
   "Agree fix and communicate status",
   "Verify regression and neighboring behavior",
   "Close report with resolution notes"
  ]
 },
 "release-readiness": {
  "name": "Release readiness",
  "tasks": [
   "Set release scope and owners",
   "Confirm code and data readiness",
   "Complete security and compatibility review",
   "Prepare support and communication materials",
   "Run go or no-go review",
   "Release gradually and inspect signals"
  ]
 },
 "customer-onboarding": {
  "name": "Customer onboarding",
  "tasks": [
   "Confirm goals and stakeholders",
   "Prepare account and access",
   "Configure workspace for agreed workflow",
   "Train users with realistic examples",
   "Confirm first useful outcome",
   "Collect feedback and hand off ongoing care"
  ]
 },
 "pricing-test": {
  "name": "Pricing experiment",
  "tasks": [
   "State pricing hypothesis and guardrails",
   "Review customer and market evidence",
   "Model packages and expected economics",
   "Check legal and billing behavior",
   "Run controlled experiment",
   "Review results and decide next step"
  ]
 },
 "accessibility-remediation": {
  "name": "Accessibility remediation",
  "tasks": [
   "Choose journeys and conformance scope",
   "Audit keyboard and assistive technology use",
   "Prioritize barriers by user impact",
   "Design and implement remediations",
   "Retest with representative users",
   "Publish findings and regression checks"
  ]
 },
 "design-system": {
  "name": "Design system update",
  "tasks": [
   "Identify component need and users",
   "Collect existing patterns and variants",
   "Specify tokens and accessible behavior",
   "Build component and usage examples",
   "Validate adoption in consuming product",
   "Publish release and migration guidance"
  ]
 },
 "integration": {
  "name": "Vendor integration",
  "tasks": [
   "Define use case and data boundary",
   "Compare provider fit and limitations",
   "Review security and contractual controls",
   "Implement isolated integration path",
   "Exercise failure and recovery behavior",
   "Approve rollout and ownership plan"
  ]
 },
 "security-review": {
  "name": "Security review",
  "tasks": [
   "Describe assets and trust boundaries",
   "Map threats and misuse scenarios",
   "Prioritize risk and required controls",
   "Implement proportionate mitigations",
   "Test controls and document evidence",
   "Approve residual risk and monitoring"
  ]
 },
 "user-survey": {
  "name": "User survey",
  "tasks": [
   "Frame research questions and audience",
   "Choose sample and recruitment plan",
   "Draft clear accessible questionnaire",
   "Pilot and launch survey",
   "Analyze patterns and uncertainty",
   "Share findings and decisions supported"
  ]
 },
 "usability-study": {
  "name": "Usability study",
  "tasks": [
   "Set study goals and participant profile",
   "Recruit and prepare consent materials",
   "Write realistic tasks and neutral prompts",
   "Run sessions and capture observations",
   "Synthesize friction and confidence levels",
   "Prioritize design changes and follow-up"
  ]
 },
 "literature-review": {
  "name": "Literature review",
  "tasks": [
   "Define question and inclusion criteria",
   "Search databases and record queries",
   "Screen sources and log exclusions",
   "Extract methods, findings, and limits",
   "Synthesize themes and disagreement",
   "Write review with traceable citations"
  ]
 },
 "competitive-analysis": {
  "name": "Competitive analysis",
  "tasks": [
   "Define customer segment and decision",
   "Select relevant alternatives and sources",
   "Compare journey and capabilities",
   "Assess positioning and business models",
   "Identify unmet needs and tradeoffs",
   "Share implications and open questions"
  ]
 },
 "data-quality": {
  "name": "Data quality improvement",
  "tasks": [
   "Name critical dataset and consumers",
   "Profile completeness and consistency",
   "Trace defects to producing systems",
   "Agree definitions and owner actions",
   "Correct records and add controls",
   "Monitor quality and publish lineage"
  ]
 },
 "interview-study": {
  "name": "Customer interview study",
  "tasks": [
   "Clarify decisions the study informs",
   "Recruit varied relevant participants",
   "Prepare consent and interview guide",
   "Conduct interviews and take notes",
   "Code themes and contrary evidence",
   "Share implications with product owners"
  ]
 },
 "advisory-board": {
  "name": "Customer advisory session",
  "tasks": [
   "Set session objective and attendee mix",
   "Prepare topics and pre-read",
   "Confirm accessibility and logistics",
   "Facilitate discussion and capture signals",
   "Synthesize feedback without overgeneralizing",
   "Send decisions and close commitments"
  ]
 },
 "seo-refresh": {
  "name": "SEO content refresh",
  "tasks": [
   "Select page and search opportunity",
   "Review intent and current performance",
   "Verify facts, sources, and freshness",
   "Rewrite structure and metadata",
   "Review accessibility and internal links",
   "Publish and monitor organic signals"
  ]
 },
 "newsletter": {
  "name": "Newsletter production",
  "tasks": [
   "Set audience and editorial objective",
   "Choose stories and source material",
   "Draft copy and calls to action",
   "Review links, claims, and layout",
   "Test delivery and send campaign",
   "Review engagement and record learnings"
  ]
 },
 "social-launch": {
  "name": "Social launch campaign",
  "tasks": [
   "Confirm launch story and audience",
   "Build channel schedule and asset list",
   "Draft platform-specific copy and media",
   "Review claims, permissions, and replies",
   "Publish with moderation coverage",
   "Report reach, response, and next actions"
  ]
 },
 "webinar": {
  "name": "Webinar delivery",
  "tasks": [
   "Define promise and target attendees",
   "Confirm speakers and platform owner",
   "Prepare accessible slides and run sheet",
   "Rehearse content and backup path",
   "Host session and manage questions",
   "Send recording and review feedback"
  ]
 },
 "brand-campaign": {
  "name": "Brand campaign",
  "tasks": [
   "Set objective and brand guardrails",
   "Gather audience and channel insight",
   "Develop creative concepts and copy",
   "Review usage rights and claims",
   "Launch approved channel assets",
   "Measure resonance and capture learning"
  ]
 },
 "case-study": {
  "name": "Customer case study",
  "tasks": [
   "Select customer and outcome story",
   "Confirm permissions and evidence sources",
   "Interview customer and gather context",
   "Draft narrative with measurable claims",
   "Obtain customer and legal approval",
   "Publish and share approved assets"
  ]
 },
 "content-refresh": {
  "name": "Content library refresh",
  "tasks": [
   "Define library scope and owner",
   "Inventory age, traffic, and accuracy",
   "Choose keep, update, merge, or retire",
   "Refresh priority assets and links",
   "Review subject matter and accessibility",
   "Publish changes and schedule future review"
  ]
 },
 "market-launch": {
  "name": "Market launch",
  "tasks": [
   "Define market assumptions and success",
   "Research customer and competitor context",
   "Confirm legal, tax, and privacy needs",
   "Prepare product and support readiness",
   "Run limited market introduction",
   "Review evidence and investment decision"
  ]
 },
 "quarterly-planning": {
  "name": "Quarterly planning",
  "tasks": [
   "Review prior quarter and strategy",
   "Propose measurable outcomes and owners",
   "Estimate effort and team capacity",
   "Resolve dependencies and tradeoffs",
   "Publish plan and communication notes",
   "Review progress and replan deliberately"
  ]
 },
 "budget-cycle": {
  "name": "Budget planning",
  "tasks": [
   "Set planning assumptions and calendar",
   "Collect owner proposals and evidence",
   "Model scenarios and constraints",
   "Review tradeoffs and approval needs",
   "Publish approved allocations and owners",
   "Track variance and update forecast"
  ]
 },
 "hiring-plan-workflow": {
  "name": "Hiring plan",
  "tasks": [
   "Confirm role scope and approval",
   "Write description and evaluation criteria",
   "Publish role and source candidates",
   "Run structured interviews and feedback",
   "Decide, check references, and make offer",
   "Prepare first-week onboarding handoff"
  ]
 },
 "employee-onboarding": {
  "name": "Employee onboarding",
  "tasks": [
   "Confirm start details and contacts",
   "Prepare equipment, accounts, and access",
   "Share team context and expectations",
   "Run role-specific training and introductions",
   "Check early goals and remove blockers",
   "Collect feedback and confirm next milestones"
  ]
 },
 "process-improvement": {
  "name": "Process improvement",
  "tasks": [
   "Choose process and improvement signal",
   "Map actual steps and handoffs",
   "Find delays, rework, and failure modes",
   "Design change and success measure",
   "Pilot change with affected participants",
   "Review results and standardize learning"
  ]
 },
 "procurement": {
  "name": "Procurement evaluation",
  "tasks": [
   "Describe need and must-have criteria",
   "Identify providers and invite proposals",
   "Compare capability, cost, and risk",
   "Review security and contract terms",
   "Approve selection and transition plan",
   "Monitor supplier performance and renewal"
  ]
 },
 "incident-response": {
  "name": "Incident response",
  "tasks": [
   "Detect incident and assign lead",
   "Assess scope and establish timeline",
   "Contain impact and protect evidence",
   "Coordinate updates and recovery work",
   "Verify service restoration and follow-up",
   "Review causes and assign improvements"
  ]
 },
 "policy-rollout": {
  "name": "Policy rollout",
  "tasks": [
   "Define policy goal and scope",
   "Review legal and operational implications",
   "Draft rules and practical examples",
   "Consult affected teams and revise",
   "Publish training and support channel",
   "Check adoption and review feedback"
  ]
 },
 "office-move": {
  "name": "Office move",
  "tasks": [
   "Set move date and constraints",
   "Inventory people, equipment, and needs",
   "Plan seating, network, and logistics",
   "Confirm vendors and safety checks",
   "Communicate move-day instructions",
   "Inspect setup and resolve issues"
  ]
 },
 "performance-cycle": {
  "name": "Performance review cycle",
  "tasks": [
   "Confirm cycle scope and guidance",
   "Gather role expectations and examples",
   "Invite employee reflection and input",
   "Hold conversation and discuss evidence",
   "Document agreements and growth actions",
   "Review follow-up progress and fairness"
  ]
 },
 "study-term": {
  "name": "Study term plan",
  "tasks": [
   "List course outcomes and deadlines",
   "Break assessments into work sessions",
   "Create repeatable weekly study blocks",
   "Review notes and practice retrieval",
   "Submit work and prepare for exams",
   "Reflect on learning and adjust routine"
  ]
 },
 "exam-preparation": {
  "name": "Exam preparation",
  "tasks": [
   "Map topics and exam format",
   "Diagnose strengths and knowledge gaps",
   "Schedule spaced active-recall sessions",
   "Practice timed questions and explain answers",
   "Review errors and target weak areas",
   "Prepare logistics and protect rest"
  ]
 },
 "job-search": {
  "name": "Job search plan",
  "tasks": [
   "Choose role criteria and target list",
   "Refresh resume and portfolio evidence",
   "Tailor application for each opportunity",
   "Build thoughtful networking conversations",
   "Prepare stories and interview practice",
   "Track outcomes and refine approach"
  ]
 },
 "moving-home": {
  "name": "Moving home checklist",
  "tasks": [
   "Confirm date and moving arrangements",
   "Inventory belongings and packing needs",
   "Transfer utilities and important records",
   "Pack by room and label essentials",
   "Complete key handover and travel",
   "Unpack essentials and update address"
  ]
 },
 "personal-finance-review": {
  "name": "Personal finance review",
  "tasks": [
   "Gather balances, income, and recurring bills",
   "Set priorities and near-term goals",
   "Review spending patterns and exceptions",
   "Choose savings and debt actions",
   "Automate safe recurring transfers",
   "Review progress and adjust next month"
  ]
 },
 "productivity-reset": {
  "name": "Personal productivity reset",
  "tasks": [
   "Collect tasks, promises, and reminders",
   "Decide what to stop or defer",
   "Choose weekly outcomes and owners",
   "Place focus blocks and recovery breaks",
   "Set up capture and review habits",
   "Reflect and simplify the next week"
  ]
 },
 "meal-plan": {
  "name": "Weekly meal planning",
  "tasks": [
   "Check calendar and dietary needs",
   "Inventory pantry and use soon items",
   "Choose meals by effort and budget",
   "Build grouped shopping list",
   "Prepare components and store safely",
   "Review waste, cost, and preferences"
  ]
 },
 "fitness-goal": {
  "name": "Fitness goal plan",
  "tasks": [
   "Define goal and current baseline",
   "Choose suitable activity and frequency",
   "Schedule gradual progression and recovery",
   "Prepare equipment and tracking method",
   "Review effort and adjust load",
   "Reflect on consistency and next cycle"
  ]
 },
 "community-event": {
  "name": "Community event plan",
  "tasks": [
   "Set purpose and invite community input",
   "Choose accessible venue and timing",
   "Assign partners, volunteers, and resources",
   "Publish invitation and practical details",
   "Host event and support participants",
   "Thank contributors and review feedback"
  ]
 },
 "grant-application": {
  "name": "Grant application",
  "tasks": [
   "Confirm eligibility and funding priorities",
   "Collect needs evidence and community input",
   "Design outcomes, activities, and measures",
   "Build budget and delivery timeline",
   "Review application against every criterion",
   "Submit and prepare reporting ownership"
  ]
 },
 "product-migration": {
  "name": "Product migration",
  "tasks": [
   "Define migration cohort and invariants",
   "Map data and compatibility requirements",
   "Build rehearsal and rollback tooling",
   "Test representative records and edge cases",
   "Communicate schedule and support route",
   "Migrate gradually and verify outcomes"
  ]
 },
 "analytics-dashboard": {
  "name": "Analytics dashboard",
  "tasks": [
   "Identify decisions and dashboard audience",
   "Agree metric definitions and sources",
   "Model reliable transformations and access",
   "Build charts with context and limits",
   "Validate totals against source records",
   "Publish ownership and review cadence"
  ]
 },
 "internal-tool": {
  "name": "Internal tool delivery",
  "tasks": [
   "Observe workflow and recurring friction",
   "Define users, permissions, and outcome",
   "Prototype with representative examples",
   "Build and test failure paths",
   "Pilot with a small team",
   "Train owners and monitor adoption"
  ]
 },
 "knowledge-base": {
  "name": "Knowledge base launch",
  "tasks": [
   "Identify audiences and common questions",
   "Choose structure, tags, and owners",
   "Draft authoritative reference articles",
   "Review access, accuracy, and discoverability",
   "Publish launch guide and team training",
   "Measure search gaps and refresh content"
  ]
 },
 "annual-review": {
  "name": "Annual planning and review",
  "tasks": [
   "Gather annual goals and outcome evidence",
   "Document wins, misses, and causes",
   "Review environment and future needs",
   "Choose priorities and success indicators",
   "Allocate owners, capacity, and budget",
   "Communicate plan and quarterly checkpoints"
  ]
 },
 "customer-support-improvement": {
  "name": "Customer support improvement",
  "tasks": [
   "Select support journey and pain signal",
   "Sample cases and agent observations",
   "Trace causes across tools and policy",
   "Prototype workflow and knowledge changes",
   "Pilot with agents and inspect outcomes",
   "Roll out changes and monitor case quality"
  ]
 },
 "data-retention": {
  "name": "Data retention review",
  "tasks": [
   "Inventory data and system owners",
   "Map legal and business retention needs",
   "Set schedules and deletion criteria",
   "Implement controls and exception handling",
   "Verify deletion and preservation behavior",
   "Record approvals and review dates"
  ]
 }
};
