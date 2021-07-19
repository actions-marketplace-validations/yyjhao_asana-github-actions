import * as core from "@actions/core";
import * as github from "@actions/github";
import * as asana from "asana";

const regex = /https:\/\/app.asana.com\/(\d+)\/(?<project>\d+)\/(?<task>\d+)/g;

type ActionType =
    | "opened"
    | "edited"
    | "closed"
    | "reopened"
    | "converted_to_draft"
    | "ready_for_review"
    | "merged";

function getAction() {
    const payload = github.context.payload;
    const action = payload.action!;

    if (action === "closed" && payload.pull_request!.merged) {
        return "merged";
    }
    return action as ActionType;
}

function taskIdsFromBody(body: string) {
    return new Set([...body.matchAll(regex)].map((m) => m.groups!.task));
}

function partitionTaskIds(action: ActionType): {
    existing: string[];
    additional: string[];
} {
    const currnetTaskIds = getCurrentTaskIds();
    if (action === "opened") {
        return {
            additional: [...currnetTaskIds],
            existing: [],
        };
    } else if (action === "edited") {
        const changes = github.context.payload.changes;
        if (changes.body) {
            const existing: string[] = [];
            taskIdsFromBody(github.context.payload.changes.body.from).forEach(
                (id) => {
                    if (currnetTaskIds.has(id)) {
                        currnetTaskIds.delete(id);
                        existing.push(id);
                    }
                }
            );
            return {
                existing,
                additional: [...currnetTaskIds],
            };
        }
    }
    return {
        additional: [],
        existing: [...currnetTaskIds],
    };
}

function getCurrentTaskIds(): Set<string> {
    return taskIdsFromBody(github.context.payload.pull_request!.body!);
}

function getOptionNameFromAction(action: ActionType): string {
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
    core.debug(`action ${JSON.stringify(github.context.payload)}`);
    const action = getAction();

    const client = asana.Client.create({
        defaultHeaders: { "asana-enable": "string_ids" },
    }).useAccessToken(core.getInput("asana-access-token"));
    const projectId = core.getInput("project-id");
    const pullRequest = github.context.payload.pull_request!;
    const taskComment = `${core.getInput("task-comment")} ${
        pullRequest.html_url
    }`;
    const customFieldName = core.getInput("custom-field-name");

    const { existing, additional } = partitionTaskIds(action);

    if (existing.length === 0 && additional.length === 0) {
        core.info("No asana link detected. Will abort now.");
        return Promise.resolve();
    }

    core.debug(
        `task ids ${JSON.stringify([...getCurrentTaskIds()])} ${JSON.stringify(
            partitionTaskIds(action)
        )}`
    );

    const optionName = getOptionNameFromAction(action);
    const { data } = await client.dispatcher.get(
        `/projects/${projectId}/custom_field_settings`
    );
    const customField = data.filter((row: any) => {
        return row.custom_field.name === customFieldName;
    })[0]?.custom_field;
    const option = customField.enum_options.filter((opt: any) => {
        return opt.name === optionName;
    })[0];
    core.debug(
        `custom field ${customField.gid}, ${option?.gid}, ${JSON.stringify(
            data
        )}`
    );

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
