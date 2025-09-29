const { Schema, model } = require("mongoose");

const TaskSchema = new Schema(
  {
    projectId: {
      type: Schema.Types.ObjectId,
      ref: "Project",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: String,
    assignees: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    priority: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium",
    },
    status: {
      type: String,
      enum: ["todo", "in_progress", "done"],
      default: "todo",
    },
    dueDate: Date,
    estimate: Number,
    tags: [String],
    attachments: [
      {
        url: String,
        type: String,
        name: String,
        size: Number,
      },
    ],
    ai: {
      type: {
        summary: String,
        suggestedSubtasks: [String],
        suggestedPriority: {
          type: String,
          enum: ["low", "medium", "high", "critical"],
        },
        lastProcessed: Date,
      },
      required: false,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

module.exports = model("Task", TaskSchema);
