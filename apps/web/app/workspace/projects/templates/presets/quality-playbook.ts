export type TemplatePresetQualityPlaybook = {
  evidence: string[];
  reviewQuestions: string[];
  riskSignals: string[];
  completionCriteria: string[];
};

// These review prompts make the starter plans easier to inspect before a team
// commits to the work. Each entry names task-specific evidence, decisions, and
// handoff conditions; the dialog renders the lists as collapsible sections.
const templatePresetQualityPlaybooks: Record<string, TemplatePresetQualityPlaybook> = {
  "product": {
    evidence: [
      "For “Review strategy and planning horizon”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Rank opportunities against criteria” to the chosen success measure for Product roadmap; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Publish proposed roadmap and risks” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Product roadmap remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Review strategy and planning horizon”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Rank opportunities against criteria”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Review strategy and planning horizon” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Rank opportunities against criteria” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Publish proposed roadmap and risks” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Review strategy and planning horizon” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Rank opportunities against criteria”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Publish proposed roadmap and risks” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Product roadmap.",
    ],
  },
  "feature-delivery": {
    evidence: [
      "For “Confirm user problem and scope”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Design accessible interaction flows” to the chosen success measure for Feature delivery; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Run quality and accessibility checks” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Feature delivery remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Confirm user problem and scope”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Design accessible interaction flows”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Confirm user problem and scope” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Design accessible interaction flows” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Run quality and accessibility checks” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Confirm user problem and scope” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Design accessible interaction flows”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Run quality and accessibility checks” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Feature delivery.",
    ],
  },
  "bug-triage": {
    evidence: [
      "For “Capture report and impact”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Assess severity and affected users” to the chosen success measure for Bug triage; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Verify regression and neighboring behavior” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Bug triage remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Capture report and impact”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Assess severity and affected users”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Capture report and impact” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Assess severity and affected users” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Verify regression and neighboring behavior” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Capture report and impact” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Assess severity and affected users”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Verify regression and neighboring behavior” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Bug triage.",
    ],
  },
  "release-readiness": {
    evidence: [
      "For “Set release scope and owners”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Complete security and compatibility review” to the chosen success measure for Release readiness; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Run go or no-go review” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Release readiness remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Set release scope and owners”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Complete security and compatibility review”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Set release scope and owners” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Complete security and compatibility review” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Run go or no-go review” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Set release scope and owners” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Complete security and compatibility review”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Run go or no-go review” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Release readiness.",
    ],
  },
  "customer-onboarding": {
    evidence: [
      "For “Confirm goals and stakeholders”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Configure workspace for agreed workflow” to the chosen success measure for Customer onboarding; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Confirm first useful outcome” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Customer onboarding remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Confirm goals and stakeholders”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Configure workspace for agreed workflow”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Confirm goals and stakeholders” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Configure workspace for agreed workflow” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Confirm first useful outcome” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Confirm goals and stakeholders” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Configure workspace for agreed workflow”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Confirm first useful outcome” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Customer onboarding.",
    ],
  },
  "pricing-test": {
    evidence: [
      "For “State pricing hypothesis and guardrails”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Model packages and expected economics” to the chosen success measure for Pricing experiment; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Run controlled experiment” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Pricing experiment remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “State pricing hypothesis and guardrails”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Model packages and expected economics”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “State pricing hypothesis and guardrails” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Model packages and expected economics” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Run controlled experiment” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “State pricing hypothesis and guardrails” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Model packages and expected economics”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Run controlled experiment” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Pricing experiment.",
    ],
  },
  "accessibility-remediation": {
    evidence: [
      "For “Choose journeys and conformance scope”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Prioritize barriers by user impact” to the chosen success measure for Accessibility remediation; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Retest with representative users” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Accessibility remediation remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Choose journeys and conformance scope”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Prioritize barriers by user impact”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Choose journeys and conformance scope” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Prioritize barriers by user impact” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Retest with representative users” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Choose journeys and conformance scope” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Prioritize barriers by user impact”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Retest with representative users” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Accessibility remediation.",
    ],
  },
  "design-system": {
    evidence: [
      "For “Identify component need and users”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Specify tokens and accessible behavior” to the chosen success measure for Design system update; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Validate adoption in consuming product” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Design system update remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Identify component need and users”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Specify tokens and accessible behavior”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Identify component need and users” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Specify tokens and accessible behavior” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Validate adoption in consuming product” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Identify component need and users” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Specify tokens and accessible behavior”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Validate adoption in consuming product” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Design system update.",
    ],
  },
  "integration": {
    evidence: [
      "For “Define use case and data boundary”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Review security and contractual controls” to the chosen success measure for Vendor integration; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Exercise failure and recovery behavior” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Vendor integration remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Define use case and data boundary”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Review security and contractual controls”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Define use case and data boundary” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Review security and contractual controls” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Exercise failure and recovery behavior” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Define use case and data boundary” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Review security and contractual controls”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Exercise failure and recovery behavior” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Vendor integration.",
    ],
  },
  "security-review": {
    evidence: [
      "For “Describe assets and trust boundaries”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Prioritize risk and required controls” to the chosen success measure for Security review; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Test controls and document evidence” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Security review remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Describe assets and trust boundaries”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Prioritize risk and required controls”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Describe assets and trust boundaries” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Prioritize risk and required controls” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Test controls and document evidence” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Describe assets and trust boundaries” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Prioritize risk and required controls”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Test controls and document evidence” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Security review.",
    ],
  },
  "user-survey": {
    evidence: [
      "For “Frame research questions and audience”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Draft clear accessible questionnaire” to the chosen success measure for User survey; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Analyze patterns and uncertainty” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in User survey remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Frame research questions and audience”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Draft clear accessible questionnaire”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Frame research questions and audience” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Draft clear accessible questionnaire” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Analyze patterns and uncertainty” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Frame research questions and audience” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Draft clear accessible questionnaire”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Analyze patterns and uncertainty” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for User survey.",
    ],
  },
  "usability-study": {
    evidence: [
      "For “Set study goals and participant profile”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Write realistic tasks and neutral prompts” to the chosen success measure for Usability study; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Synthesize friction and confidence levels” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Usability study remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Set study goals and participant profile”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Write realistic tasks and neutral prompts”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Set study goals and participant profile” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Write realistic tasks and neutral prompts” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Synthesize friction and confidence levels” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Set study goals and participant profile” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Write realistic tasks and neutral prompts”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Synthesize friction and confidence levels” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Usability study.",
    ],
  },
  "literature-review": {
    evidence: [
      "For “Define question and inclusion criteria”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Screen sources and log exclusions” to the chosen success measure for Literature review; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Synthesize themes and disagreement” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Literature review remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Define question and inclusion criteria”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Screen sources and log exclusions”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Define question and inclusion criteria” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Screen sources and log exclusions” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Synthesize themes and disagreement” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Define question and inclusion criteria” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Screen sources and log exclusions”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Synthesize themes and disagreement” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Literature review.",
    ],
  },
  "competitive-analysis": {
    evidence: [
      "For “Define customer segment and decision”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Compare journey and capabilities” to the chosen success measure for Competitive analysis; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Identify unmet needs and tradeoffs” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Competitive analysis remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Define customer segment and decision”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Compare journey and capabilities”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Define customer segment and decision” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Compare journey and capabilities” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Identify unmet needs and tradeoffs” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Define customer segment and decision” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Compare journey and capabilities”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Identify unmet needs and tradeoffs” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Competitive analysis.",
    ],
  },
  "data-quality": {
    evidence: [
      "For “Name critical dataset and consumers”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Trace defects to producing systems” to the chosen success measure for Data quality improvement; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Correct records and add controls” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Data quality improvement remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Name critical dataset and consumers”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Trace defects to producing systems”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Name critical dataset and consumers” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Trace defects to producing systems” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Correct records and add controls” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Name critical dataset and consumers” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Trace defects to producing systems”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Correct records and add controls” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Data quality improvement.",
    ],
  },
  "interview-study": {
    evidence: [
      "For “Clarify decisions the study informs”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Prepare consent and interview guide” to the chosen success measure for Customer interview study; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Code themes and contrary evidence” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Customer interview study remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Clarify decisions the study informs”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Prepare consent and interview guide”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Clarify decisions the study informs” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Prepare consent and interview guide” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Code themes and contrary evidence” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Clarify decisions the study informs” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Prepare consent and interview guide”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Code themes and contrary evidence” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Customer interview study.",
    ],
  },
  "advisory-board": {
    evidence: [
      "For “Set session objective and attendee mix”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Confirm accessibility and logistics” to the chosen success measure for Customer advisory session; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Synthesize feedback without overgeneralizing” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Customer advisory session remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Set session objective and attendee mix”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Confirm accessibility and logistics”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Set session objective and attendee mix” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Confirm accessibility and logistics” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Synthesize feedback without overgeneralizing” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Set session objective and attendee mix” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Confirm accessibility and logistics”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Synthesize feedback without overgeneralizing” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Customer advisory session.",
    ],
  },
  "seo-refresh": {
    evidence: [
      "For “Select page and search opportunity”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Verify facts, sources, and freshness” to the chosen success measure for SEO content refresh; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Review accessibility and internal links” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in SEO content refresh remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Select page and search opportunity”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Verify facts, sources, and freshness”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Select page and search opportunity” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Verify facts, sources, and freshness” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Review accessibility and internal links” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Select page and search opportunity” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Verify facts, sources, and freshness”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Review accessibility and internal links” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for SEO content refresh.",
    ],
  },
  "newsletter": {
    evidence: [
      "For “Set audience and editorial objective”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Draft copy and calls to action” to the chosen success measure for Newsletter production; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Test delivery and send campaign” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Newsletter production remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Set audience and editorial objective”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Draft copy and calls to action”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Set audience and editorial objective” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Draft copy and calls to action” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Test delivery and send campaign” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Set audience and editorial objective” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Draft copy and calls to action”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Test delivery and send campaign” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Newsletter production.",
    ],
  },
  "social-launch": {
    evidence: [
      "For “Confirm launch story and audience”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Draft platform-specific copy and media” to the chosen success measure for Social launch campaign; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Publish with moderation coverage” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Social launch campaign remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Confirm launch story and audience”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Draft platform-specific copy and media”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Confirm launch story and audience” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Draft platform-specific copy and media” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Publish with moderation coverage” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Confirm launch story and audience” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Draft platform-specific copy and media”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Publish with moderation coverage” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Social launch campaign.",
    ],
  },
  "webinar": {
    evidence: [
      "For “Define promise and target attendees”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Prepare accessible slides and run sheet” to the chosen success measure for Webinar delivery; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Host session and manage questions” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Webinar delivery remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Define promise and target attendees”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Prepare accessible slides and run sheet”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Define promise and target attendees” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Prepare accessible slides and run sheet” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Host session and manage questions” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Define promise and target attendees” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Prepare accessible slides and run sheet”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Host session and manage questions” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Webinar delivery.",
    ],
  },
  "brand-campaign": {
    evidence: [
      "For “Set objective and brand guardrails”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Develop creative concepts and copy” to the chosen success measure for Brand campaign; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Launch approved channel assets” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Brand campaign remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Set objective and brand guardrails”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Develop creative concepts and copy”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Set objective and brand guardrails” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Develop creative concepts and copy” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Launch approved channel assets” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Set objective and brand guardrails” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Develop creative concepts and copy”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Launch approved channel assets” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Brand campaign.",
    ],
  },
  "case-study": {
    evidence: [
      "For “Select customer and outcome story”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Interview customer and gather context” to the chosen success measure for Customer case study; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Obtain customer and legal approval” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Customer case study remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Select customer and outcome story”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Interview customer and gather context”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Select customer and outcome story” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Interview customer and gather context” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Obtain customer and legal approval” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Select customer and outcome story” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Interview customer and gather context”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Obtain customer and legal approval” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Customer case study.",
    ],
  },
  "content-refresh": {
    evidence: [
      "For “Define library scope and owner”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Choose keep, update, merge, or retire” to the chosen success measure for Content library refresh; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Review subject matter and accessibility” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Content library refresh remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Define library scope and owner”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Choose keep, update, merge, or retire”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Define library scope and owner” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Choose keep, update, merge, or retire” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Review subject matter and accessibility” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Define library scope and owner” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Choose keep, update, merge, or retire”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Review subject matter and accessibility” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Content library refresh.",
    ],
  },
  "market-launch": {
    evidence: [
      "For “Define market assumptions and success”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Confirm legal, tax, and privacy needs” to the chosen success measure for Market launch; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Run limited market introduction” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Market launch remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Define market assumptions and success”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Confirm legal, tax, and privacy needs”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Define market assumptions and success” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Confirm legal, tax, and privacy needs” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Run limited market introduction” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Define market assumptions and success” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Confirm legal, tax, and privacy needs”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Run limited market introduction” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Market launch.",
    ],
  },
  "quarterly-planning": {
    evidence: [
      "For “Review prior quarter and strategy”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Estimate effort and team capacity” to the chosen success measure for Quarterly planning; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Publish plan and communication notes” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Quarterly planning remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Review prior quarter and strategy”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Estimate effort and team capacity”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Review prior quarter and strategy” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Estimate effort and team capacity” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Publish plan and communication notes” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Review prior quarter and strategy” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Estimate effort and team capacity”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Publish plan and communication notes” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Quarterly planning.",
    ],
  },
  "budget-cycle": {
    evidence: [
      "For “Set planning assumptions and calendar”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Model scenarios and constraints” to the chosen success measure for Budget planning; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Publish approved allocations and owners” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Budget planning remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Set planning assumptions and calendar”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Model scenarios and constraints”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Set planning assumptions and calendar” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Model scenarios and constraints” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Publish approved allocations and owners” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Set planning assumptions and calendar” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Model scenarios and constraints”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Publish approved allocations and owners” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Budget planning.",
    ],
  },
  "hiring-plan-workflow": {
    evidence: [
      "For “Confirm role scope and approval”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Publish role and source candidates” to the chosen success measure for Hiring plan; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Decide, check references, and make offer” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Hiring plan remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Confirm role scope and approval”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Publish role and source candidates”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Confirm role scope and approval” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Publish role and source candidates” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Decide, check references, and make offer” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Confirm role scope and approval” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Publish role and source candidates”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Decide, check references, and make offer” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Hiring plan.",
    ],
  },
  "employee-onboarding": {
    evidence: [
      "For “Confirm start details and contacts”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Share team context and expectations” to the chosen success measure for Employee onboarding; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Check early goals and remove blockers” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Employee onboarding remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Confirm start details and contacts”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Share team context and expectations”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Confirm start details and contacts” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Share team context and expectations” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Check early goals and remove blockers” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Confirm start details and contacts” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Share team context and expectations”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Check early goals and remove blockers” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Employee onboarding.",
    ],
  },
  "process-improvement": {
    evidence: [
      "For “Choose process and improvement signal”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Find delays, rework, and failure modes” to the chosen success measure for Process improvement; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Pilot change with affected participants” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Process improvement remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Choose process and improvement signal”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Find delays, rework, and failure modes”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Choose process and improvement signal” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Find delays, rework, and failure modes” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Pilot change with affected participants” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Choose process and improvement signal” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Find delays, rework, and failure modes”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Pilot change with affected participants” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Process improvement.",
    ],
  },
  "procurement": {
    evidence: [
      "For “Describe need and must-have criteria”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Compare capability, cost, and risk” to the chosen success measure for Procurement evaluation; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Approve selection and transition plan” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Procurement evaluation remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Describe need and must-have criteria”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Compare capability, cost, and risk”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Describe need and must-have criteria” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Compare capability, cost, and risk” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Approve selection and transition plan” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Describe need and must-have criteria” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Compare capability, cost, and risk”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Approve selection and transition plan” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Procurement evaluation.",
    ],
  },
  "incident-response": {
    evidence: [
      "For “Detect incident and assign lead”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Contain impact and protect evidence” to the chosen success measure for Incident response; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Verify service restoration and follow-up” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Incident response remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Detect incident and assign lead”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Contain impact and protect evidence”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Detect incident and assign lead” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Contain impact and protect evidence” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Verify service restoration and follow-up” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Detect incident and assign lead” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Contain impact and protect evidence”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Verify service restoration and follow-up” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Incident response.",
    ],
  },
  "policy-rollout": {
    evidence: [
      "For “Define policy goal and scope”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Draft rules and practical examples” to the chosen success measure for Policy rollout; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Publish training and support channel” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Policy rollout remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Define policy goal and scope”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Draft rules and practical examples”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Define policy goal and scope” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Draft rules and practical examples” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Publish training and support channel” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Define policy goal and scope” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Draft rules and practical examples”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Publish training and support channel” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Policy rollout.",
    ],
  },
  "office-move": {
    evidence: [
      "For “Set move date and constraints”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Plan seating, network, and logistics” to the chosen success measure for Office move; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Communicate move-day instructions” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Office move remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Set move date and constraints”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Plan seating, network, and logistics”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Set move date and constraints” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Plan seating, network, and logistics” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Communicate move-day instructions” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Set move date and constraints” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Plan seating, network, and logistics”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Communicate move-day instructions” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Office move.",
    ],
  },
  "performance-cycle": {
    evidence: [
      "For “Confirm cycle scope and guidance”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Invite employee reflection and input” to the chosen success measure for Performance review cycle; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Document agreements and growth actions” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Performance review cycle remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Confirm cycle scope and guidance”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Invite employee reflection and input”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Confirm cycle scope and guidance” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Invite employee reflection and input” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Document agreements and growth actions” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Confirm cycle scope and guidance” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Invite employee reflection and input”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Document agreements and growth actions” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Performance review cycle.",
    ],
  },
  "study-term": {
    evidence: [
      "For “List course outcomes and deadlines”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Create repeatable weekly study blocks” to the chosen success measure for Study term plan; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Submit work and prepare for exams” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Study term plan remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “List course outcomes and deadlines”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Create repeatable weekly study blocks”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “List course outcomes and deadlines” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Create repeatable weekly study blocks” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Submit work and prepare for exams” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “List course outcomes and deadlines” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Create repeatable weekly study blocks”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Submit work and prepare for exams” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Study term plan.",
    ],
  },
  "exam-preparation": {
    evidence: [
      "For “Map topics and exam format”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Schedule spaced active-recall sessions” to the chosen success measure for Exam preparation; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Review errors and target weak areas” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Exam preparation remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Map topics and exam format”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Schedule spaced active-recall sessions”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Map topics and exam format” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Schedule spaced active-recall sessions” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Review errors and target weak areas” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Map topics and exam format” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Schedule spaced active-recall sessions”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Review errors and target weak areas” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Exam preparation.",
    ],
  },
  "job-search": {
    evidence: [
      "For “Choose role criteria and target list”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Tailor application for each opportunity” to the chosen success measure for Job search plan; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Prepare stories and interview practice” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Job search plan remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Choose role criteria and target list”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Tailor application for each opportunity”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Choose role criteria and target list” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Tailor application for each opportunity” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Prepare stories and interview practice” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Choose role criteria and target list” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Tailor application for each opportunity”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Prepare stories and interview practice” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Job search plan.",
    ],
  },
  "moving-home": {
    evidence: [
      "For “Confirm date and moving arrangements”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Transfer utilities and important records” to the chosen success measure for Moving home checklist; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Complete key handover and travel” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Moving home checklist remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Confirm date and moving arrangements”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Transfer utilities and important records”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Confirm date and moving arrangements” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Transfer utilities and important records” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Complete key handover and travel” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Confirm date and moving arrangements” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Transfer utilities and important records”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Complete key handover and travel” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Moving home checklist.",
    ],
  },
  "personal-finance-review": {
    evidence: [
      "For “Gather balances, income, and recurring bills”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Review spending patterns and exceptions” to the chosen success measure for Personal finance review; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Automate safe recurring transfers” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Personal finance review remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Gather balances, income, and recurring bills”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Review spending patterns and exceptions”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Gather balances, income, and recurring bills” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Review spending patterns and exceptions” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Automate safe recurring transfers” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Gather balances, income, and recurring bills” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Review spending patterns and exceptions”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Automate safe recurring transfers” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Personal finance review.",
    ],
  },
  "productivity-reset": {
    evidence: [
      "For “Collect tasks, promises, and reminders”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Choose weekly outcomes and owners” to the chosen success measure for Personal productivity reset; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Set up capture and review habits” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Personal productivity reset remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Collect tasks, promises, and reminders”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Choose weekly outcomes and owners”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Collect tasks, promises, and reminders” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Choose weekly outcomes and owners” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Set up capture and review habits” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Collect tasks, promises, and reminders” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Choose weekly outcomes and owners”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Set up capture and review habits” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Personal productivity reset.",
    ],
  },
  "meal-plan": {
    evidence: [
      "For “Check calendar and dietary needs”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Choose meals by effort and budget” to the chosen success measure for Weekly meal planning; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Prepare components and store safely” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Weekly meal planning remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Check calendar and dietary needs”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Choose meals by effort and budget”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Check calendar and dietary needs” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Choose meals by effort and budget” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Prepare components and store safely” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Check calendar and dietary needs” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Choose meals by effort and budget”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Prepare components and store safely” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Weekly meal planning.",
    ],
  },
  "fitness-goal": {
    evidence: [
      "For “Define goal and current baseline”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Schedule gradual progression and recovery” to the chosen success measure for Fitness goal plan; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Review effort and adjust load” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Fitness goal plan remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Define goal and current baseline”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Schedule gradual progression and recovery”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Define goal and current baseline” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Schedule gradual progression and recovery” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Review effort and adjust load” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Define goal and current baseline” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Schedule gradual progression and recovery”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Review effort and adjust load” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Fitness goal plan.",
    ],
  },
  "community-event": {
    evidence: [
      "For “Set purpose and invite community input”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Assign partners, volunteers, and resources” to the chosen success measure for Community event plan; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Host event and support participants” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Community event plan remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Set purpose and invite community input”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Assign partners, volunteers, and resources”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Set purpose and invite community input” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Assign partners, volunteers, and resources” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Host event and support participants” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Set purpose and invite community input” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Assign partners, volunteers, and resources”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Host event and support participants” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Community event plan.",
    ],
  },
  "grant-application": {
    evidence: [
      "For “Confirm eligibility and funding priorities”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Design outcomes, activities, and measures” to the chosen success measure for Grant application; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Review application against every criterion” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Grant application remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Confirm eligibility and funding priorities”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Design outcomes, activities, and measures”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Confirm eligibility and funding priorities” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Design outcomes, activities, and measures” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Review application against every criterion” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Confirm eligibility and funding priorities” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Design outcomes, activities, and measures”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Review application against every criterion” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Grant application.",
    ],
  },
  "product-migration": {
    evidence: [
      "For “Define migration cohort and invariants”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Build rehearsal and rollback tooling” to the chosen success measure for Product migration; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Communicate schedule and support route” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Product migration remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Define migration cohort and invariants”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Build rehearsal and rollback tooling”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Define migration cohort and invariants” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Build rehearsal and rollback tooling” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Communicate schedule and support route” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Define migration cohort and invariants” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Build rehearsal and rollback tooling”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Communicate schedule and support route” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Product migration.",
    ],
  },
  "analytics-dashboard": {
    evidence: [
      "For “Identify decisions and dashboard audience”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Model reliable transformations and access” to the chosen success measure for Analytics dashboard; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Validate totals against source records” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Analytics dashboard remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Identify decisions and dashboard audience”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Model reliable transformations and access”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Identify decisions and dashboard audience” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Model reliable transformations and access” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Validate totals against source records” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Identify decisions and dashboard audience” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Model reliable transformations and access”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Validate totals against source records” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Analytics dashboard.",
    ],
  },
  "internal-tool": {
    evidence: [
      "For “Observe workflow and recurring friction”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Prototype with representative examples” to the chosen success measure for Internal tool delivery; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Pilot with a small team” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Internal tool delivery remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Observe workflow and recurring friction”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Prototype with representative examples”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Observe workflow and recurring friction” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Prototype with representative examples” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Pilot with a small team” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Observe workflow and recurring friction” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Prototype with representative examples”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Pilot with a small team” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Internal tool delivery.",
    ],
  },
  "knowledge-base": {
    evidence: [
      "For “Identify audiences and common questions”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Draft authoritative reference articles” to the chosen success measure for Knowledge base launch; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Publish launch guide and team training” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Knowledge base launch remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Identify audiences and common questions”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Draft authoritative reference articles”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Identify audiences and common questions” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Draft authoritative reference articles” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Publish launch guide and team training” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Identify audiences and common questions” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Draft authoritative reference articles”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Publish launch guide and team training” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Knowledge base launch.",
    ],
  },
  "annual-review": {
    evidence: [
      "For “Gather annual goals and outcome evidence”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Review environment and future needs” to the chosen success measure for Annual planning and review; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Allocate owners, capacity, and budget” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Annual planning and review remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Gather annual goals and outcome evidence”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Review environment and future needs”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Gather annual goals and outcome evidence” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Review environment and future needs” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Allocate owners, capacity, and budget” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Gather annual goals and outcome evidence” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Review environment and future needs”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Allocate owners, capacity, and budget” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Annual planning and review.",
    ],
  },
  "customer-support-improvement": {
    evidence: [
      "For “Select support journey and pain signal”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Trace causes across tools and policy” to the chosen success measure for Customer support improvement; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Pilot with agents and inspect outcomes” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Customer support improvement remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Select support journey and pain signal”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Trace causes across tools and policy”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Select support journey and pain signal” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Trace causes across tools and policy” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Pilot with agents and inspect outcomes” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Select support journey and pain signal” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Trace causes across tools and policy”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Pilot with agents and inspect outcomes” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Customer support improvement.",
    ],
  },
  "data-retention": {
    evidence: [
      "For “Inventory data and system owners”, capture the source, collection date, accountable owner, and observed result so a reviewer can reproduce the decision without relying on memory.",
      "Tie evidence from “Set schedules and deletion criteria” to the chosen success measure for Data retention review; preserve its baseline, sample, and limitations beside every reported result.",
      "Store evidence in the agreed workspace location, record who can access it, and link the source record from “Verify deletion and preservation behavior” before closing the task.",
    ],
    reviewQuestions: [
      "What assumption in Data retention review remains unverified, who can resolve it, and what decision changes if the evidence disagrees with the current plan?",
      "Who is most affected by “Inventory data and system owners”, and how will their input be heard before the team considers this work complete and ready to hand off?",
      "Which dependency, schedule, policy, or resource decision could delay “Set schedules and deletion criteria”, and when does its accountable owner need to escalate the issue?",
    ],
    riskSignals: [
      "Pause if “Inventory data and system owners” grows beyond the agreed audience or outcome; record the new request and get an explicit scope decision before work expands.",
      "Escalate when evidence collected during “Set schedules and deletion criteria” contradicts a key assumption, weakens confidence, or shows an unrepresented group may be affected.",
      "Retain a recovery route for “Verify deletion and preservation behavior” if delivery could interrupt users, expose information, create external commitments, or prevent a timely rollback.",
    ],
    completionCriteria: [
      "Close “Inventory data and system owners” only after a reviewer can verify the result from a linked artifact, named owner, observable acceptance criterion, and dated evidence.",
      "For “Set schedules and deletion criteria”, record approvals, unresolved questions, applicable policy checks, and the reason for any accepted exception before proceeding.",
      "Complete “Verify deletion and preservation behavior” when the receiving owner confirms access, understands the open risks, and accepts a dated follow-up point for Data retention review.",
    ],
  },
};

export function getTemplatePresetQualityPlaybook(presetId: string) {
  return templatePresetQualityPlaybooks[presetId] ?? null;
}
