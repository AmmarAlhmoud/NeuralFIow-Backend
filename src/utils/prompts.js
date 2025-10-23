function buildSummaryPrompt(task, comments) {
  const header = `Please analyze the following task and its discussion, then provide a concise summary in 6-8 bullet points. Focus on:
- Key decisions made
- Current blockers or issues
- Action items and owners
- Important deadlines or milestones
- Current status and next steps

Format as bullet points starting with • and keep each point under 100 characters.
Return plain text with each bullet on a new line (no HTML tags).`;

  const taskInfo = `
TASK DETAILS:
Title: ${task.title}
Description: ${task.description || "No description provided"}
Priority: ${task.priority}
Status: ${task.status}
Due Date: ${
    task.dueDate ? task.dueDate.toISOString().split("T")[0] : "No due date"
  }
tags: ${task.tags && task.tags.length > 0 ? task.tags.join(", ") : "None"}`;

  const commentsInfo =
    comments.length > 0
      ? `\n\nRECENT DISCUSSION (${comments.length} comments):\n` +
        comments
          .map(
            (c, index) =>
              `${index + 1}. [${c.createdAt.toDateString()}] ${
                c.authorId?.name || "Unknown"
              }: ${c.body}`
          )
          .join("\n")
      : "\n\nRECENT DISCUSSION: No comments yet";

  return `${header}${taskInfo}${commentsInfo}`;
}

function buildSubtasksPrompt(task) {
  return `Break down the following task into 6-8 specific, actionable subtasks.

TASK DETAILS:
Title: ${task.title}
Description: ${task.description || "No additional description provided"}
Priority: ${task.priority}
Estimated Hours: ${task.estimate || "Not specified"}

REQUIREMENTS FOR EACH SUBTASK:
- Start with an action verb (Create, Update, Test, Review, Design, Implement, etc.)
- Be specific and measurable
- Take 1-4 hours to complete
- Be ordered logically by dependency

IMPORTANT: Return ONLY a plain text list with one subtask per line. Do NOT use markdown, bullets, or numbering. Do NOT include any explanations or additional text.

Example format:
Create database schema for user profiles
Implement user registration API endpoint
Design login UI components
Write unit tests for authentication
Review and optimize security measures

Generate 6-8 subtasks now:`;
}

function buildPriorityPrompt(task) {
  const dueDateContext = task.dueDate
    ? `Due date: ${task.dueDate.toISOString().split("T")[0]} (${getDaysUntilDue(
        task.dueDate
      )} days from now)`
    : "No due date specified";

  const tagsContext =
    task.tags && task.tags.length > 0
      ? `tags: ${task.tags.join(", ")}`
      : "No tags assigned";

  return `Analyze this task and suggest an appropriate priority level. Consider urgency, impact, dependencies, and business value.

TASK ANALYSIS:
Title: ${task.title}
Description: ${task.description || "No description provided"}
${dueDateContext}
${tagsContext}
Current Priority: ${task.priority}
Estimated Effort: ${task.estimate ? task.estimate + " hours" : "Not estimated"}

PRIORITY LEVELS:
- critical: Blocking others, production issues, urgent deadlines (within 24-48 hours)
- high: Important deadlines (within 1 week), high business impact
- medium: Standard tasks, moderate impact, flexible deadlines
- low: Nice-to-have features, documentation, cleanup tasks

IMPORTANT: Respond with ONLY the raw JSON object. Do NOT wrap it in markdown code blocks or backticks. Do NOT include \`\`\`json or \`\`\`.

Response format:
{
  "priority": "low|medium|high|critical",
  "reason": "Brief explanation (max 100 characters)"
}`;
}

function getDaysUntilDue(dueDate) {
  const now = new Date();
  const due = new Date(dueDate);
  const diffTime = due - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

module.exports = {
  buildSummaryPrompt,
  buildSubtasksPrompt,
  buildPriorityPrompt,
};
