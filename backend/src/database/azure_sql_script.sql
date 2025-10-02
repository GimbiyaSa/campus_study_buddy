-- Campus Study Buddy Database Creation Script for Azure SQL Database
-- This script creates all tables with proper relationships and indexes

-- Drop tables in reverse dependency order if they exist (for development)
IF OBJECT_ID('dbo.shared_notes', 'U') IS NOT NULL DROP TABLE dbo.shared_notes;
IF OBJECT_ID('dbo.partner_matches', 'U') IS NOT NULL DROP TABLE dbo.partner_matches;
IF OBJECT_ID('dbo.chat_messages', 'U') IS NOT NULL DROP TABLE dbo.chat_messages;
IF OBJECT_ID('dbo.chat_rooms', 'U') IS NOT NULL DROP TABLE dbo.chat_rooms;
IF OBJECT_ID('dbo.notifications', 'U') IS NOT NULL DROP TABLE dbo.notifications;
IF OBJECT_ID('dbo.study_hours', 'U') IS NOT NULL DROP TABLE dbo.study_hours;
IF OBJECT_ID('dbo.user_progress', 'U') IS NOT NULL DROP TABLE dbo.user_progress;
IF OBJECT_ID('dbo.session_attendees', 'U') IS NOT NULL DROP TABLE dbo.session_attendees;
IF OBJECT_ID('dbo.study_sessions', 'U') IS NOT NULL DROP TABLE dbo.study_sessions;
IF OBJECT_ID('dbo.group_members', 'U') IS NOT NULL DROP TABLE dbo.group_members;
IF OBJECT_ID('dbo.study_groups', 'U') IS NOT NULL DROP TABLE dbo.study_groups;
IF OBJECT_ID('dbo.chapters', 'U') IS NOT NULL DROP TABLE dbo.chapters;
IF OBJECT_ID('dbo.topics', 'U') IS NOT NULL DROP TABLE dbo.topics;
IF OBJECT_ID('dbo.user_modules', 'U') IS NOT NULL DROP TABLE dbo.user_modules;
IF OBJECT_ID('dbo.modules', 'U') IS NOT NULL DROP TABLE dbo.modules;
IF OBJECT_ID('dbo.users', 'U') IS NOT NULL DROP TABLE dbo.users;

-- Create Users table
CREATE TABLE dbo.users (
    user_id NVARCHAR(255) PRIMARY KEY,
    email NVARCHAR(255) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    first_name NVARCHAR(100) NOT NULL,
    last_name NVARCHAR(100) NOT NULL,
    university NVARCHAR(255) NOT NULL,
    course NVARCHAR(255) NOT NULL,
    year_of_study INT CHECK (year_of_study BETWEEN 1 AND 10),
    bio NTEXT,
    profile_image_url NVARCHAR(500),
    study_preferences NVARCHAR(MAX) CHECK (ISJSON(study_preferences) = 1),
    profile_visibility NVARCHAR(50) DEFAULT 'public' CHECK (profile_visibility IN ('public', 'university', 'private')),
    is_active BIT DEFAULT 1,
    last_login_at DATETIME2,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE()
);

-- Create Modules table
CREATE TABLE dbo.modules (
    module_id INT IDENTITY(1,1) PRIMARY KEY,
    module_code NVARCHAR(50) NOT NULL UNIQUE,
    module_name NVARCHAR(255) NOT NULL,
    description NTEXT,
    university NVARCHAR(255) NOT NULL,
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETUTCDATE()
);

-- Create User_Modules junction table
CREATE TABLE dbo.user_modules (
    user_module_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id NVARCHAR(255) NOT NULL,
    module_id INT NOT NULL,
    enrollment_status NVARCHAR(50) DEFAULT 'active' CHECK (enrollment_status IN ('active', 'completed', 'dropped')),
    enrolled_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES dbo.modules(module_id) ON DELETE CASCADE,
    UNIQUE(user_id, module_id)
);

-- Create Topics table
CREATE TABLE dbo.topics (
    topic_id INT IDENTITY(1,1) PRIMARY KEY,
    module_id INT NOT NULL,
    topic_name NVARCHAR(255) NOT NULL,
    description NTEXT,
    order_sequence INT DEFAULT 0,
    estimated_hours DECIMAL(5,2) DEFAULT 0,
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (module_id) REFERENCES dbo.modules(module_id) ON DELETE CASCADE
);

-- Create Chapters table
CREATE TABLE dbo.chapters (
    chapter_id INT IDENTITY(1,1) PRIMARY KEY,
    topic_id INT NOT NULL,
    chapter_name NVARCHAR(255) NOT NULL,
    description NTEXT,
    order_sequence INT DEFAULT 0,
    content_summary NTEXT,
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (topic_id) REFERENCES dbo.topics(topic_id) ON DELETE CASCADE
);

-- Create Study Groups table
CREATE TABLE dbo.study_groups (
    group_id INT IDENTITY(1,1) PRIMARY KEY,
    group_name NVARCHAR(255) NOT NULL,
    description NTEXT,
    creator_id NVARCHAR(255) NOT NULL,
    module_id INT NOT NULL,
    max_members INT DEFAULT 10 CHECK (max_members > 0),
    group_type NVARCHAR(50) DEFAULT 'study' CHECK (group_type IN ('study', 'project', 'exam_prep', 'discussion')),
    group_goals NVARCHAR(MAX) CHECK (ISJSON(group_goals) = 1),
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (creator_id) REFERENCES dbo.users(user_id),
    FOREIGN KEY (module_id) REFERENCES dbo.modules(module_id)
);

-- Create Group Members junction table
CREATE TABLE dbo.group_members (
    membership_id INT IDENTITY(1,1) PRIMARY KEY,
    group_id INT NOT NULL,
    user_id NVARCHAR(255) NOT NULL,
    role NVARCHAR(50) DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
    status NVARCHAR(50) DEFAULT 'active' CHECK (status IN ('pending', 'active', 'inactive', 'removed')),
    joined_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (group_id) REFERENCES dbo.study_groups(group_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE,
    UNIQUE(group_id, user_id)
);

-- Create Study Sessions table
CREATE TABLE dbo.study_sessions (
    session_id INT IDENTITY(1,1) PRIMARY KEY,
    group_id INT NOT NULL,
    organizer_id NVARCHAR(255) NOT NULL,
    session_title NVARCHAR(255) NOT NULL,
    description NTEXT,
    scheduled_start DATETIME2 NOT NULL,
    scheduled_end DATETIME2 NOT NULL,
    actual_start DATETIME2,
    actual_end DATETIME2,
    location NVARCHAR(500),
    session_type NVARCHAR(50) DEFAULT 'study' CHECK (session_type IN ('study', 'review', 'project', 'exam_prep', 'discussion')),
    status NVARCHAR(50) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (group_id) REFERENCES dbo.study_groups(group_id) ON DELETE CASCADE,
    FOREIGN KEY (organizer_id) REFERENCES dbo.users(user_id),
    CHECK (scheduled_end > scheduled_start)
);

-- Create Session Attendees table
CREATE TABLE dbo.session_attendees (
    attendance_id INT IDENTITY(1,1) PRIMARY KEY,
    session_id INT NOT NULL,
    user_id NVARCHAR(255) NOT NULL,
    attendance_status NVARCHAR(50) DEFAULT 'pending' CHECK (attendance_status IN ('pending', 'attending', 'attended', 'absent', 'declined')),
    responded_at DATETIME2,
    notes NTEXT,
    FOREIGN KEY (session_id) REFERENCES dbo.study_sessions(session_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE,
    UNIQUE(session_id, user_id)
);

-- Create User Progress table
CREATE TABLE dbo.user_progress (
    progress_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id NVARCHAR(255) NOT NULL,
    topic_id INT,
    chapter_id INT,
    completion_status NVARCHAR(50) DEFAULT 'not_started' CHECK (completion_status IN ('not_started', 'in_progress', 'completed', 'reviewed')),
    hours_spent DECIMAL(5,2) DEFAULT 0 CHECK (hours_spent >= 0),
    notes NTEXT,
    started_at DATETIME2,
    completed_at DATETIME2,
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES dbo.topics(topic_id),
    FOREIGN KEY (chapter_id) REFERENCES dbo.chapters(chapter_id)
);

-- Create Study Hours table
CREATE TABLE dbo.study_hours (
    hour_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id NVARCHAR(255) NOT NULL,
    module_id INT,
    topic_id INT,
    session_id INT,
    hours_logged DECIMAL(5,2) NOT NULL CHECK (hours_logged > 0),
    description NTEXT,
    study_date DATE NOT NULL,
    logged_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (module_id) REFERENCES dbo.modules(module_id),
    FOREIGN KEY (topic_id) REFERENCES dbo.topics(topic_id),
    FOREIGN KEY (session_id) REFERENCES dbo.study_sessions(session_id)
);

-- Create Notifications table
CREATE TABLE dbo.notifications (
    notification_id INT IDENTITY(1,1) PRIMARY KEY,
    user_id NVARCHAR(255) NOT NULL,
    notification_type NVARCHAR(100) NOT NULL CHECK (notification_type IN ('session_reminder', 'group_invite', 'progress_update', 'partner_match', 'message', 'system')),
    title NVARCHAR(255) NOT NULL,
    message NTEXT NOT NULL,
    metadata NVARCHAR(MAX) CHECK (ISJSON(metadata) = 1),
    is_read BIT DEFAULT 0,
    scheduled_for DATETIME2,
    sent_at DATETIME2,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (user_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE
);

-- Create Chat Rooms table
CREATE TABLE dbo.chat_rooms (
    room_id INT IDENTITY(1,1) PRIMARY KEY,
    group_id INT NOT NULL,
    room_name NVARCHAR(255) NOT NULL,
    room_type NVARCHAR(50) DEFAULT 'group' CHECK (room_type IN ('group', 'private', 'session')),
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (group_id) REFERENCES dbo.study_groups(group_id) ON DELETE CASCADE
);

-- Create Chat Messages table
CREATE TABLE dbo.chat_messages (
    message_id INT IDENTITY(1,1) PRIMARY KEY,
    room_id INT NOT NULL,
    sender_id NVARCHAR(255) NOT NULL,
    message_content NTEXT NOT NULL,
    message_type NVARCHAR(50) DEFAULT 'text' CHECK (message_type IN ('text', 'file', 'image', 'link', 'system')),
    attachments NVARCHAR(MAX) CHECK (ISJSON(attachments) = 1),
    is_deleted BIT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (room_id) REFERENCES dbo.chat_rooms(room_id) ON DELETE CASCADE,
    FOREIGN KEY (sender_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE
);

-- Create Partner Matches table
CREATE TABLE dbo.partner_matches (
    match_id INT IDENTITY(1,1) PRIMARY KEY,
    requester_id NVARCHAR(255) NOT NULL,
    matched_user_id NVARCHAR(255) NOT NULL,
    module_id INT NOT NULL,
    match_status NVARCHAR(50) DEFAULT 'pending' CHECK (match_status IN ('pending', 'accepted', 'declined', 'expired')),
    compatibility_score DECIMAL(3,2) CHECK (compatibility_score BETWEEN 0 AND 1),
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (requester_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (matched_user_id) REFERENCES dbo.users(user_id),
    FOREIGN KEY (module_id) REFERENCES dbo.modules(module_id),
    CHECK (requester_id != matched_user_id)
);

-- Create Shared Notes table
CREATE TABLE dbo.shared_notes (
    note_id INT IDENTITY(1,1) PRIMARY KEY,
    group_id INT NOT NULL,
    author_id NVARCHAR(255) NOT NULL,
    topic_id INT,
    note_title NVARCHAR(255) NOT NULL,
    note_content NTEXT NOT NULL,
    attachments NVARCHAR(MAX) CHECK (ISJSON(attachments) = 1),
    visibility NVARCHAR(50) DEFAULT 'group' CHECK (visibility IN ('group', 'public', 'private')),
    is_active BIT DEFAULT 1,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (group_id) REFERENCES dbo.study_groups(group_id) ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES dbo.users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (topic_id) REFERENCES dbo.topics(topic_id)
);

-- Create indexes for better performance
CREATE INDEX IX_users_email ON dbo.users(email);
CREATE INDEX IX_users_university_course ON dbo.users(university, course);
CREATE INDEX IX_users_last_login ON dbo.users(last_login_at);
CREATE INDEX IX_modules_code ON dbo.modules(module_code);
CREATE INDEX IX_modules_university ON dbo.modules(university);
CREATE INDEX IX_user_modules_user_id ON dbo.user_modules(user_id);
CREATE INDEX IX_user_modules_module_id ON dbo.user_modules(module_id);
CREATE INDEX IX_user_modules_enrollment_status ON dbo.user_modules(enrollment_status);
CREATE INDEX IX_topics_module_id ON dbo.topics(module_id);
CREATE INDEX IX_topics_order_sequence ON dbo.topics(order_sequence);
CREATE INDEX IX_chapters_topic_id ON dbo.chapters(topic_id);
CREATE INDEX IX_study_groups_creator_id ON dbo.study_groups(creator_id);
CREATE INDEX IX_study_groups_module_id ON dbo.study_groups(module_id);
CREATE INDEX IX_group_members_group_id ON dbo.group_members(group_id);
CREATE INDEX IX_group_members_user_id ON dbo.group_members(user_id);
CREATE INDEX IX_study_sessions_group_id ON dbo.study_sessions(group_id);
CREATE INDEX IX_study_sessions_scheduled_start ON dbo.study_sessions(scheduled_start);
CREATE INDEX IX_session_attendees_session_id ON dbo.session_attendees(session_id);
CREATE INDEX IX_session_attendees_user_id ON dbo.session_attendees(user_id);
CREATE INDEX IX_user_progress_user_id ON dbo.user_progress(user_id);
CREATE INDEX IX_user_progress_topic_id ON dbo.user_progress(topic_id);
CREATE INDEX IX_user_progress_topic_completion ON dbo.user_progress(user_id, topic_id, completion_status) WHERE chapter_id IS NULL;
CREATE INDEX IX_study_hours_user_id ON dbo.study_hours(user_id);
CREATE INDEX IX_study_hours_study_date ON dbo.study_hours(study_date);
CREATE INDEX IX_study_hours_topic_user ON dbo.study_hours(topic_id, user_id, study_date);
CREATE INDEX IX_notifications_user_id_is_read ON dbo.notifications(user_id, is_read);
CREATE INDEX IX_chat_messages_room_id_created_at ON dbo.chat_messages(room_id, created_at);
CREATE INDEX IX_partner_matches_requester_id ON dbo.partner_matches(requester_id);
CREATE INDEX IX_partner_matches_matched_user_id ON dbo.partner_matches(matched_user_id);
CREATE INDEX IX_shared_notes_group_id ON dbo.shared_notes(group_id);

-- Create triggers for updated_at columns
GO
CREATE TRIGGER tr_users_updated_at ON dbo.users
    AFTER UPDATE AS
    UPDATE dbo.users SET updated_at = GETUTCDATE()
    FROM dbo.users u INNER JOIN inserted i ON u.user_id = i.user_id;

GO
CREATE TRIGGER tr_study_groups_updated_at ON dbo.study_groups
    AFTER UPDATE AS
    UPDATE dbo.study_groups SET updated_at = GETUTCDATE()
    FROM dbo.study_groups sg INNER JOIN inserted i ON sg.group_id = i.group_id;

GO
CREATE TRIGGER tr_group_members_updated_at ON dbo.group_members
    AFTER UPDATE AS
    UPDATE dbo.group_members SET updated_at = GETUTCDATE()
    FROM dbo.group_members gm INNER JOIN inserted i ON gm.membership_id = i.membership_id;

GO
CREATE TRIGGER tr_study_sessions_updated_at ON dbo.study_sessions
    AFTER UPDATE AS
    UPDATE dbo.study_sessions SET updated_at = GETUTCDATE()
    FROM dbo.study_sessions ss INNER JOIN inserted i ON ss.session_id = i.session_id;

GO
CREATE TRIGGER tr_user_progress_updated_at ON dbo.user_progress
    AFTER UPDATE AS
    UPDATE dbo.user_progress SET updated_at = GETUTCDATE()
    FROM dbo.user_progress up INNER JOIN inserted i ON up.progress_id = i.progress_id;

GO
CREATE TRIGGER tr_chat_messages_updated_at ON dbo.chat_messages
    AFTER UPDATE AS
    UPDATE dbo.chat_messages SET updated_at = GETUTCDATE()
    FROM dbo.chat_messages cm INNER JOIN inserted i ON cm.message_id = i.message_id;

GO
CREATE TRIGGER tr_partner_matches_updated_at ON dbo.partner_matches
    AFTER UPDATE AS
    UPDATE dbo.partner_matches SET updated_at = GETUTCDATE()
    FROM dbo.partner_matches pm INNER JOIN inserted i ON pm.match_id = i.match_id;

GO
CREATE TRIGGER tr_shared_notes_updated_at ON dbo.shared_notes
    AFTER UPDATE AS
    UPDATE dbo.shared_notes SET updated_at = GETUTCDATE()
    FROM dbo.shared_notes sn INNER JOIN inserted i ON sn.note_id = i.note_id;

PRINT 'Campus Study Buddy database schema created successfully!';