# Simple Asana Github Action

A bare minimum Asana Github Action. The idea is to do only the absolute minimum and leave the
rest to the Asana custom triggers. This action only supports:

1. Adding a comment to Asana tasks when the tasks are first mentioned in the pull request description
2. Adding those tasks to a single project
3. Setting a custom field value on the tasks in that project

Note that it will detect any Asana links mentioned in the pull request description.

For things like closing the task on merge, moving the task to a section, or adding the task to another
Asana project, use the Asana custom triggers feature instead (or use a different Github Action).

The project must contain the custom field (more below), and the custom field must be an enum type with
the following values:

-   In Progress
-   Closed
-   Draft
-   Merged

## Inputs

## `asana-access-token`

**Required** A personal access token with access to all tasks that can be mentioned and the project

## `task-comment`

**Required** Text for adding comments to a task. The comment will appear as {{task-comment}} {{github url}}

## `project-id`

**Required** ID of project to multi-home task to.

## `custom-field-name`

**Required** Custom field to synchronize with github PR status. This custom field must be available in the project above.

The action will attempt to set the custom field according to the pull request action. It supports the following event types:

-   opened
-   edited
-   closed
-   reopened
-   converted_to_draft
-   ready_for_review

## Example usage

```yaml
uses: yyjhao/asana-github-actions@v1.0.0
with:
    asana-access-token: "<your access token>"
    task-comment: "Pull requests opened: "
    project-id: "<some project id>"
    custom-field-name: "PR status"
```

It's recommended to tied this up with the pull request event types, for example:

```yaml
name: Asana Action
on:
    pull_request:
        types:
            [
                opened,
                edited,
                closed,
                reopened,
                converted_to_draft,
                ready_for_review,
            ]
jobs:
    Update-on-PR:
        runs-on: ubuntu-latest
        steps:
            - name: run action
              uses: yyjhao/asana-github-actions@v1.0.0
              with:
                  asana-access-token: "<your access token>"
                  task-comment: "Pull requests opened: "
                  project-id: "<some project id>"
                  custom-field-name: "PR status"
```
