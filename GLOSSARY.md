# backslash

A self-hosted LaTeX editor in the browser: people write a project together in real time, compile it to a PDF and share it.

## Language

### Projects and files

**Project**:
A set of files and folders, owned by one user, that compile together into one PDF.
_Avoid_: document, workspace, repo

**File**:
An item in a project, identified by its path: either a text file or an uploaded file.
_Avoid_: document, source

**Text file**:
A file whose content members edit in the editor, together and in real time.
_Avoid_: source file, document

**Uploaded file**:
A file added from the user's disk, such as an image, PDF or font; it can be replaced but not edited in the editor.
_Avoid_: blob, attachment, asset

**Folder**:
A named group of files inside a project; it may be empty.
_Avoid_: directory

**Path**:
Where a file or folder sits in a project, relative to the project root.

**Main file**:
The `.tex` file a compile starts from; each project has exactly one.
_Avoid_: root file, entry point, main document

**Outline**:
The headings of a project's document, from parts down to subsubsections, in reading order: those in the main file and in the files it includes.
_Avoid_: table of contents, TOC, structure

### Compiling

**Compile**:
One run of LaTeX over a project's files, started by a member, that ends with an outcome and a log.
_Avoid_: build, render

**Outcome**:
How a compile ended: succeeded (a PDF was made), error (LaTeX reported errors), timed out, or failed (the compiler crashed).
_Avoid_: status, result

**Compile error**:
A problem LaTeX reported, with the file and line it points to when it points into the project.
_Avoid_: diagnostic, problem

**Log**:
The full text LaTeX printed during a compile.

**PDF**:
The output of the project's last successful compile, the one every member sees; a later compile that fails leaves it in place.
_Avoid_: output, preview, build

### Access and sharing

**Member**:
A user who has a role in a project.
_Avoid_: collaborator, participant

**Role**:
What a member may do in a project: owner, editor or viewer.
_Avoid_: permission, access level

**Owner**:
The one member a project belongs to; only they manage its members and invite links, rename it or delete it.

**Editor**:
A member who can change the project's files.

**Viewer**:
A member who can read the files, compile and see the PDF, but change no file.

**Invite link**:
A link that makes whoever opens it a member with a set role, until it expires or is revoked.
_Avoid_: share link, invitation, token

### Accounts and administration

**User**:
A person signed in to this server.
_Avoid_: account, customer

**Sign-in method**:
A way a user signs in: with a password or with GitHub.
_Avoid_: account, provider, login

**Admin**:
A user who manages the other users and sees server-wide statistics, but not project content.
_Avoid_: superuser, moderator

**Banned user**:
A user an admin has blocked from signing in.
_Avoid_: suspended, disabled

**Limit**:
The most projects a user may own, or the most storage they may use; an admin can set it per user, else the server default applies.
_Avoid_: quota, cap

**Storage**:
The total size of the uploaded files in the projects a user owns, each file counted once.
_Avoid_: disk usage, space
