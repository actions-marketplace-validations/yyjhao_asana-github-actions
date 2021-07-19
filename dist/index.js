"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const github = __importStar(require("@actions/github"));
const asana = __importStar(require("asana"));
const regex = /https:\/\/app.asana.com\/(\d+)\/(?<project>\d+)\/(?<task>\d+)/g;
function getAction() {
    const payload = github.context.payload;
    const action = payload.action;
    if (action === "closed" && payload.pull_request.merged) {
        return "merged";
    }
    return action;
}
function taskIdsFromBody(body) {
    return new Set([...body.matchAll(regex)].map((m) => m.groups.task));
}
function partitionTaskIds(action) {
    const idsNow = getCurrentTaskIds();
    if (action === "opened") {
        return {
            additional: [...idsNow],
            existing: [],
        };
    }
    else if (action === "edited") {
        const changes = github.context.payload.changes;
        if (changes.body) {
            const existing = [];
            taskIdsFromBody(github.context.payload.changes.body.from).forEach((id) => {
                if (idsNow.has(id)) {
                    idsNow.delete(id);
                    existing.push(id);
                }
            });
            return {
                existing,
                additional: [...idsNow],
            };
        }
    }
    return {
        additional: [],
        existing: [...idsNow],
    };
}
function getCurrentTaskIds() {
    return taskIdsFromBody(github.context.payload.pull_request.body);
}
function getOptionNameFromAction(action) {
    switch (action) {
        case "opened":
        case "edited":
        case "reopened":
        case "ready_for_review":
            return "In Progress";
        case "closed":
            return "Closed";
        case "converted_to_draft":
            return "Draft";
        case "merged":
            return "Merged";
    }
}
(async () => {
    var _a;
    core.debug(`action ${JSON.stringify(github.context.payload)}`);
    const action = getAction();
    const client = asana.Client.create({
        defaultHeaders: { "asana-enable": "string_ids" },
    }).useAccessToken(core.getInput("asana-access-token"));
    const projectId = core.getInput("project-id");
    const pullRequest = github.context.payload.pull_request;
    const taskComment = `${core.getInput("task-comment")} ${pullRequest.html_url}`;
    const customFieldName = core.getInput("custom-field-name");
    const { existing, additional } = partitionTaskIds(action);
    if (existing.length === 0 && additional.length === 0) {
        core.info("No asana link detected. Will abort now.");
        return Promise.resolve();
    }
    core.debug(`task ids ${JSON.stringify([...getCurrentTaskIds()])} ${JSON.stringify(partitionTaskIds(action))}`);
    const optionName = getOptionNameFromAction(action);
    const { data } = await client.dispatcher.get(`/projects/${projectId}/custom_field_settings`);
    const customField = (_a = data.filter((row) => {
        return row.custom_field.name === customFieldName;
    })[0]) === null || _a === void 0 ? void 0 : _a.custom_field;
    const option = customField.enum_options.filter((opt) => {
        return opt.name === optionName;
    })[0];
    core.debug(`custom field ${customField.gid}, ${option === null || option === void 0 ? void 0 : option.gid}, ${JSON.stringify(data)}`);
    await Promise.all([
        ...(customField && option
            ? existing.map((id) => {
                return client.dispatcher.put(`/tasks/${id}`, {
                    custom_fields: {
                        [customField.gid]: option.gid,
                    },
                });
            })
            : []),
        ...additional.map((id) => {
            return Promise.all([
                client.tasks
                    .addProject(id, {
                    project: projectId,
                })
                    .then(() => {
                    return client.dispatcher.put(`/tasks/${id}`, {
                        custom_fields: {
                            [customField.gid]: option.gid,
                        },
                    });
                }),
                client.tasks.addComment(id, {
                    text: taskComment,
                }),
            ]);
        }),
    ]);
})().catch((e) => {
    core.setFailed(e.message);
});
