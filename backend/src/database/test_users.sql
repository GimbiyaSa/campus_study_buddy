-- Test users for Partners functionality
-- This script adds some sample users with different study preferences for testing

-- Delete any existing test users first
DELETE FROM dbo.users WHERE user_id IN ('test_user_1', 'test_user_2', 'test_user_3', 'test_user_4', 'test_user_5');

-- Test User 1: Computer Science student interested in algorithms
INSERT INTO dbo.users (
    user_id, email, password_hash, first_name, last_name, university, course, year_of_study, bio, study_preferences, is_active
) VALUES (
    'test_user_1',
    'alice.smith@mit.edu',
    'hashed_password',
    'Alice',
    'Smith',
    'MIT',
    'Computer Science',
    3,
    'Passionate about algorithms and machine learning. Love solving complex problems and working in study groups.',
    '{"studyStyle": "visual", "groupSize": "small", "environment": "quiet", "availability": ["morning", "afternoon"]}'
);

-- Test User 2: Data Science student with flexible preferences
INSERT INTO dbo.users (
    user_id, email, password_hash, first_name, last_name, university, course, year_of_study, bio, study_preferences, is_active
) VALUES (
    'test_user_2',
    'bob.johnson@mit.edu',
    'hashed_password',
    'Bob',
    'Johnson',
    'MIT',
    'Data Science',
    2,
    'Data enthusiast looking for study partners for statistics and machine learning projects.',
    '{"studyStyle": "collaborative", "groupSize": "medium", "environment": "collaborative", "availability": ["afternoon", "evening"]}'
);

-- Test User 3: Software Engineering student with evening availability
INSERT INTO dbo.users (
    user_id, email, password_hash, first_name, last_name, university, course, year_of_study, bio, study_preferences, is_active
) VALUES (
    'test_user_3',
    'carol.wilson@stanford.edu',
    'hashed_password',
    'Carol',
    'Wilson',
    'Stanford University',
    'Software Engineering',
    4,
    'Senior student with experience in full-stack development. Happy to help junior students and collaborate on projects.',
    '{"studyStyle": "mixed", "groupSize": "large", "environment": "flexible", "availability": ["evening"]}'
);

-- Test User 4: Mathematics student with morning preference
INSERT INTO dbo.users (
    user_id, email, password_hash, first_name, last_name, university, course, year_of_study, bio, study_preferences, is_active
) VALUES (
    'test_user_4',
    'david.brown@mit.edu',
    'hashed_password',
    'David',
    'Brown',
    'MIT',
    'Applied Mathematics',
    1,
    'First-year student eager to learn and find study partners for calculus and linear algebra.',
    '{"studyStyle": "auditory", "groupSize": "small", "environment": "quiet", "availability": ["morning"]}'
);

-- Test User 5: Computer Science student with different preferences
INSERT INTO dbo.users (
    user_id, email, password_hash, first_name, last_name, university, course, year_of_study, bio, study_preferences, is_active
) VALUES (
    'test_user_5',
    'emma.davis@mit.edu',
    'hashed_password',
    'Emma',
    'Davis',
    'MIT',
    'Computer Science',
    2,
    'Second-year CS student interested in web development and databases. Prefer hands-on learning.',
    '{"studyStyle": "kinesthetic", "groupSize": "medium", "environment": "collaborative", "availability": ["afternoon", "evening"]}'
);

-- Display inserted users
SELECT 
    user_id,
    first_name + ' ' + last_name as name,
    email,
    university,
    course,
    year_of_study,
    study_preferences
FROM dbo.users 
WHERE user_id LIKE 'test_user_%'
ORDER BY user_id;