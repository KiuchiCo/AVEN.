# Create templates from scratch

The template library supports direct authoring as well as saving an existing project. A new template can start blank or from a starter plan, then be edited before it is saved. The initial starter plans cover a website launch, research sprint, content campaign, event, and hiring process.

Each plan is regular template data: task titles, priorities, labels, prerequisite indexes, relative due offsets, and milestone offsets. Users can change or remove starter rows, add more rows within the API limits, and save the resulting plan as a workspace-owned template.

The template create endpoint validates every field and prerequisite graph before persisting. It records the author and creates a workspace activity entry. Import remains a separate endpoint and activity type so an uploaded file is distinguishable from a template authored inside the app.
