function buildSummaryPrompt(task, comments) {
  const header = `Please analyze the following task and its discussion, then provide a concise summary in 6-8 bullet points. Focus on:
- Key decisions made
- Current blockers or issues
- Action items and owners
- Important deadlines or milestones
- Current status and next steps

Format as bullet points starting with • and keep each point under 100 characters.`;

  const taskInfo = `
TASK DETAILS:
Title: ${task.title}
Description: ${task.description || "No description provided"}
Priority: ${task.priority}
Status: ${task.status}
Due Date: ${
    task.dueDate ? task.dueDate.toISOString().split("T")[0] : "No due date"
  }
Labels: ${
    task.labels && task.labels.length > 0 ? task.labels.join(", ") : "None"
  }`;

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
  return `Break down the following task into 6-10 specific, actionable subtasks. Each subtask should:
- Start with an action verb (Create, Update, Test, Review, etc.)
- Be specific and measurable
- Take 1-4 hours to complete
- Include clear acceptance criteria
- Be ordered logically

Format as a simple list, one subtask per line.

TASK TO BREAK DOWN:
Title: ${task.title}
Description: ${task.description || "No additional description provided"}
Priority: ${task.priority}
Estimated Hours: ${task.estimate || "Not specified"}

Generate practical subtasks that a developer/team member could immediately start working on:`;
}

function buildPriorityPrompt(task) {
  const dueDateContext = task.dueDate
    ? `Due date: ${task.dueDate.toISOString().split("T")[0]} (${getDaysUntilDue(
        task.dueDate
      )} days from now)`
    : "No due date specified";

  const labelsContext =
    task.labels && task.labels.length > 0
      ? `Labels: ${task.labels.join(", ")}`
      : "No labels assigned";

  return `Analyze this task and suggest an appropriate priority level. Consider urgency, impact, dependencies, and business value.

TASK ANALYSIS:
Title: ${task.title}
Description: ${task.description || "No description provided"}
${dueDateContext}
${labelsContext}
Current Priority: ${task.priority}
Estimated Effort: ${task.estimate ? task.estimate + " hours" : "Not estimated"}

PRIORITY LEVELS:
- critical: Blocking others, production issues, urgent deadlines (within 24-48 hours)
- high: Important deadlines (within 1 week), high business impact
- medium: Standard tasks, moderate impact, flexible deadlines
- low: Nice-to-have features, documentation, cleanup tasks

Respond with JSON only:
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
