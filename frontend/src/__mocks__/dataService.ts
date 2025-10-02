// __mocks__/dataService.ts
// Define StudyPartner type locally since the import is missing
export interface StudyPartner {
  id: string;
  name: string;
  university: string;
  course: string;
  yearOfStudy: number;
  bio: string;
  sharedCourses: string[];
  studyPreferences: {
    preferredTimes: string[];
    environment: string;
    studyStyle: string;
  };
  compatibilityScore: number;
}

export const mockPartners: StudyPartner[] = [
  {
    id: '1',
    name: 'Alice Smith',
    university: 'Test University',
    course: 'Mathematics',
    yearOfStudy: 2,
    bio: 'Math enthusiast',
    sharedCourses: ['Mathematics'],
    studyPreferences: {
      preferredTimes: ['Morning'],
      environment: 'Library',
      studyStyle: 'Group'
    },
    compatibilityScore: 95
  },
  {
    id: '2',
    name: 'Bob Lee',
    university: 'Test University',
    course: 'Physics',
    yearOfStudy: 3,
    bio: 'Physics lover',
    sharedCourses: ['Physics'],
    studyPreferences: {
      preferredTimes: ['Evening'],
      environment: 'Home',
      studyStyle: 'Solo'
    },
    compatibilityScore: 90
  }
];

const DataService = {
  searchPartners: async () => mockPartners,
  fetchPartners: async () => mockPartners,
  sendBuddyRequest: async () => {},
};

export default DataService;
