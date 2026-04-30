export type CannesPresence = {
  id: string;
  userId: string | null;
  talentId: string | null;
  arrivalDate: string;
  departureDate: string;
  hotel: string | null;
  hotelAddress: string | null;
  flightArrival: string | null;
  flightDeparture: string | null;
  roomNumber: string | null;
  notes: string | null;
  user: { id: string; prenom: string; nom: string; role?: string } | null;
  talent: {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
    instagram: string | null;
    tiktok: string | null;
  } | null;
};

export type CannesEventAttendee = {
  id: string;
  presenceId: string;
  presence: CannesPresence;
};

export type CannesEvent = {
  id: string;
  date: string;
  startTime: string;
  endTime: string | null;
  title: string;
  type: string;
  location: string;
  address: string | null;
  organizer: string | null;
  contactInfo: string | null;
  dressCode: string | null;
  invitationLink: string | null;
  description: string | null;
  notes: string | null;
  attendees: CannesEventAttendee[];
};

export type CannesContact = {
  id: string;
  firstName: string;
  lastName: string;
  company: string | null;
  role: string | null;
  phone: string | null;
  email: string | null;
  instagram: string | null;
  hotel: string | null;
  arrivalDate: string | null;
  departureDate: string | null;
  category: string;
  notes: string | null;
};
