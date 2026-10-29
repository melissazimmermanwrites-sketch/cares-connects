"""Single source of truth for the CARES Connects brain.

RULE: nothing in this file is guessed. Every answer is either
  - copied from CARES Connects' own public site copy (caresconnects.org), or
  - a well-known public crisis line (911, 988, 211), or
  - a true statement about how this chat itself works.
Program details (hours, phone numbers, addresses, eligibility) are NEVER
taught to the brain. It only (1) names which kind of help someone needs
and (2) answers questions about CARES Connects. Listings always come live
from the directory database, so the brain can't make one up.

The need vocabulary is built from the tags on Mel's real listings
(data/seed/directory.json) plus the plain-language phrases below.
"""

# ───────────────────────────── FAQ answers ─────────────────────────────
# (questions, answer, source)

FAQ = [
    (
        ["what is cares connects", "what is this", "what is this site", "what do you do", "what does cares connects do",
         "what is this website", "what is cares", "tell me about cares connects", "how does this work",
         "what is this for"],
        "CARES Connects is a free directory of verified local help. Tell me where you are and what you need, and I "
        "will show you programs near you.",
        "Site hero: 'Find verified local help.' / 'Get matched to local verified resources'",
    ),
    (
        ["is this free", "is it free", "does it cost money", "how much does it cost", "do i have to pay",
         "is there a fee", "do i need an account", "do i have to sign up", "do i need to register",
         "do i need to log in", "do i have to make an account"],
        "Yes. CARES Connects is free to use, and you do not need an account.",
        "Site hero checklist: 'Free to use' / 'No account needed'",
    ),
    (
        ["are these verified", "are the listings verified", "is this information accurate", "can i trust this",
         "how do you check programs", "are these programs real", "how do you verify", "is this up to date"],
        "Provider information is checked at the source. Hours and services can change, so please call the program to "
        "confirm before you go.",
        "Site feature strip: 'Provider information checked at the source' + site disclaimer",
    ),
    (
        ["will they help me for sure", "am i guaranteed help", "do i qualify", "am i eligible", "what are the rules",
         "do i need id", "do i need documents", "what do i need to bring", "are they open now", "what are the hours"],
        "Each program sets its own hours, costs, and eligibility. Results are not a guarantee of program "
        "availability, so please contact the program to confirm.",
        "Site disclaimer: 'Results are not a guarantee of program availability; contact program providers to "
        "confirm hours, costs, or eligibility.'",
    ),
    (
        ["where do you cover", "what areas do you serve", "what counties do you cover", "do you cover my area",
         "is this only california", "what places do you cover", "where are you", "do you serve my county"],
        "CARES Connects lists programs in California, starting with Placer and Sacramento Counties.",
        "Site feature strip: 'Piloting in Placer and Sacramento Counties' + statewide California directory",
    ),
    (
        ["who runs this", "who made this", "who is behind cares connects", "who are you guys", "who owns this",
         "is this a nonprofit", "is cares connects a nonprofit", "who is cares"],
        "CARES Connects is run by Community Alliance of Resources Education and Support, a California 501(c)(3) "
        "nonprofit. The team includes educators, veterans, and consultants.",
        "Site footer + About section",
    ),
    (
        ["what is your mission", "why do you do this", "what is the mission", "why does cares connects exist"],
        "Our mission is to close the gap between available support and the people who need it most.",
        "Site About section (quoted mission)",
    ),
    (
        ["how do i list my organization", "how do i add my program", "can i add my nonprofit",
         "i run a nonprofit", "how do i get listed", "can my agency be listed", "how do i submit a program"],
        "Nonprofits and public agencies can add their programs with the List your organization form. Each "
        "submission is reviewed before it goes live.",
        "Site partner card: 'Add your programs ... We review each submission before it goes live.'",
    ),
    (
        ["how can i donate", "can i donate", "how do i give money", "how can i support you", "how can i help",
         "can i volunteer for cares connects", "how do i give"],
        "Thank you. Gifts help check listings, add new programs, and keep CARES Connects free. You can use the "
        "Donate link on this site.",
        "Site campaign section: 'Your gift helps us check listings, add new programs, and keep CARES Connects free'",
    ),
    (
        ["are you a person", "are you a robot", "are you human", "are you a bot", "am i talking to a real person",
         "is this a real person", "who are you", "what are you"],
        "I am the CARES Connects helper, a small program that helps you find local services. I am not a person. "
        "For a person, dial 211.",
        "How this chat works + 211",
    ),
    (
        ["do you save my messages", "is this private", "do you keep my information", "is this chat private",
         "do you track me", "who can see this chat"],
        "This chat runs in your browser and does not save your messages.",
        "How this chat works (no server logging)",
    ),
    (
        ["can i talk to a person", "i want to talk to a human", "can i call someone", "is there a phone number",
         "how do i reach a person", "i need to talk to someone real"],
        "Dial 211 to talk with a person who can point you to local programs. If you are in crisis, call or text "
        "988.",
        "211 / 988 public lines (site footer)",
    ),
    (
        ["what is 988", "what is the crisis line", "what number do i call in a crisis", "is there a crisis line"],
        "988 is the Suicide and Crisis Lifeline. You can call or text 988. It is free, confidential, and open 24/7. "
        "If you are in danger, call 911.",
        "Site crisis bar: '988 Suicide & Crisis Lifeline: free, confidential, 24/7'",
    ),
    (
        ["what is 211", "what does 211 do"],
        "Dial 211 to talk with a person who can connect you with local services.",
        "Site footer copy",
    ),
]

GREETING_Q = ["hi", "hello", "hey", "hi there", "hello there", "good morning", "good afternoon", "good evening",
              "hey there", "yo", "howdy", "help", "i need help", "can you help me", "can you help"]
GREETING_A = "Hi. I can help you find local help in California. What do you need help with?"

THANKS_Q = ["thanks", "thank you", "thank you so much", "thx", "ok thanks", "that helps", "great thanks"]
THANKS_A = "You are welcome. I am here if you need anything else."

OFFTOPIC_Q = [
    "what is the weather", "who won the game", "tell me a joke", "what is 2 plus 2", "write me a poem",
    "what is the capital of france", "how do i code in python", "who is the president", "what movies are playing",
    "what is bitcoin", "recommend a restaurant", "what time is it", "how tall is mount everest",
    "what is your favorite color", "can you do my homework", "translate this to french", "what is the stock market doing",
    "who is taylor swift", "play a song", "how do i lose weight fast",
]
DEFLECT = ("I can only help you find local services in California. Tell me what you need help with, like food, "
           "housing, or health care.")

OUT_OF_STATE_Q = ["i live in texas", "i am in new york", "i am not in california", "i live in oregon",
                  "i am in nevada", "i live in arizona", "i am outside california", "i live in florida"]
OUT_OF_STATE_A = ("Right now CARES Connects only covers California. Dial 211 to reach local help in most of the "
                  "United States. If you are in crisis, call or text 988.")

# ─────────────────────────── crisis (backstop) ───────────────────────────
# The widget catches these with hard rules BEFORE the brain runs. They are also
# in the corpus so the brain's answer agrees if one ever slips through.
CRISIS_Q = [
    "i want to kill myself", "i want to die", "i am going to kill myself", "i dont want to live anymore",
    "i am thinking about suicide", "i want to end my life", "i am going to hurt myself", "i cut myself",
    "i am not safe", "someone is going to hurt me", "i am in danger", "he is going to kill me", "she hits me",
    "my husband hits me", "my boyfriend hit me", "my partner is hurting me", "i was raped", "i overdosed",
    "help me i am in danger", "suicidal",
]

# ───────────────────────────── need phrases ─────────────────────────────
# Plain-language ways people ask for each category. Obvious mappings only.

NEED_PHRASES = {
    "food": ["food", "groceries", "a food pantry", "a food bank", "a hot meal", "something to eat", "free food",
             "free meals", "calfresh", "food stamps", "ebt", "lunch", "dinner", "a soup kitchen"],
    "shelter-and-housing": ["housing", "a shelter", "a place to stay", "a place to sleep", "somewhere to sleep",
                            "rent help", "help paying rent", "affordable housing", "a homeless shelter",
                            "a bed tonight", "an apartment", "transitional housing"],
    "domestic-violence-ipv": ["domestic violence help", "a domestic violence shelter", "help leaving an abuser",
                              "a restraining order", "safety planning", "help with an abusive relationship"],
    "crisis-help-lines": ["a crisis line", "a hotline", "someone to talk to right now", "a 24 hour hotline",
                          "a crisis hotline", "a helpline"],
    "substance-abuse-and-recovery": ["drug rehab", "alcohol treatment", "detox", "addiction help", "aa meetings",
                                     "na meetings", "sober living", "help quitting drugs", "help to stop drinking",
                                     "substance abuse treatment", "recovery support"],
    "medical-and-dental-health": ["a doctor", "a free clinic", "medical care", "a dentist", "dental care",
                                  "health insurance", "medi-cal", "a health clinic", "eye care", "glasses",
                                  "a checkup", "health care"],
    "suicide-prevention": ["suicide prevention", "suicide prevention help", "support after a suicide loss"],
    "human-trafficking": ["help for trafficking survivors", "human trafficking help", "a trafficking hotline"],
    "job-assistance": ["a job", "work", "job training", "resume help", "help finding work", "employment help",
                       "a job program", "career help", "job search help"],
    "financial-aid": ["money help", "cash assistance", "help paying bills", "help with my electric bill",
                      "utility help", "emergency money", "free tax help", "financial help", "help with bills"],
    "legal": ["a lawyer", "legal help", "free legal aid", "eviction help", "help with custody", "a divorce lawyer",
              "help with court", "legal advice", "help with child support"],
    "transportation": ["a ride", "transportation", "a ride to the doctor", "bus passes", "help getting around",
                       "rides for seniors", "paratransit", "a ride to my appointment"],
    "immigration": ["immigration help", "an immigration lawyer", "help with citizenship", "daca help",
                    "asylum help", "help with my green card", "immigration legal services"],
    "disability-support": ["disability services", "help for my disabled son", "autism services",
                           "developmental disability services", "services for people with disabilities"],
    "aging-adult": ["senior services", "help for my elderly mom", "a senior center", "help for seniors",
                    "elder care", "dementia support", "medicare help"],
    "in-home-help": ["in-home care", "a caregiver", "home care", "meals on wheels", "help at home for my dad",
                     "respite care", "home repairs for seniors"],
    "hospice": ["hospice", "grief support", "end of life care", "palliative care", "a grief group",
                "help after a death in the family"],
    "mental-health": ["counseling", "therapy", "a therapist", "mental health help", "help with depression",
                      "help with anxiety", "a counselor", "a support group", "mental health services"],
    "mentorship": ["a mentor", "a mentor for my kid", "youth mentoring", "big brothers big sisters"],
    "parenting-resources": ["parenting classes", "help with my baby", "diapers", "pregnancy help",
                            "parenting support", "help raising my kids", "childcare", "child care"],
    "rehabilitation": ["help after prison", "reentry help", "help on probation", "record clearance",
                       "help getting my record expunged", "help after jail"],
    "youth-activities": ["after school programs", "summer camp", "activities for kids", "youth sports",
                         "teen programs", "things for my kids to do"],
    "small-business": ["small business help", "a business loan", "help starting a business", "a microloan",
                       "business training"],
    "foster-youth": ["foster youth services", "help aging out of foster care", "help for foster kids",
                     "former foster youth help"],
    "latino": ["services in spanish", "spanish speaking help", "latino services", "help in spanish"],
    "tribal": ["native american services", "tribal services", "indian health services",
               "help for native american families"],
    "household-goods": ["furniture", "household items", "a bed", "pots and pans", "household goods",
                        "free furniture"],
    "pet-health-and-rescue": ["help with my pet", "a low cost vet", "pet food", "a vet", "animal rescue",
                              "help for my dog", "help for my cat"],
    "clothing": ["clothes", "clothing", "free clothes", "a coat", "shoes", "work clothes", "a clothing closet"],
    "education": ["ged classes", "adult education", "english classes", "esl classes", "tutoring",
                  "help going back to school"],
    "community-services": ["community services", "a community center", "a resource center", "general help"],
    "veterans": ["veteran services", "va benefits help", "help for veterans", "help for a veteran",
                 "military family support"],
    "donation-and-volunteer": ["volunteer opportunities", "a place to volunteer", "where to donate",
                               "somewhere to donate clothes"],
}

# Situations: what people say instead of naming a service. Obvious mappings only.
SITUATIONS = {
    "food": ["i am hungry", "we have no food", "i cant afford groceries", "my kids are hungry",
             "we ran out of food", "i have not eaten today"],
    "shelter-and-housing": ["i am homeless", "i have nowhere to sleep", "we got evicted", "i am getting evicted",
                            "i lost my apartment", "i am sleeping in my car", "i cant pay my rent",
                            "we have nowhere to go tonight"],
    "domestic-violence-ipv": ["my partner abuses me", "i need to leave my abuser", "my ex is stalking me",
                              "i am afraid of my husband"],
    "substance-abuse-and-recovery": ["i drink too much", "i am addicted to drugs", "my son is using drugs",
                                     "i want to get sober", "i cant stop drinking"],
    "medical-and-dental-health": ["i am sick and have no insurance", "my tooth hurts", "i need to see a doctor",
                                  "i cant afford a doctor", "i lost my glasses"],
    "job-assistance": ["i lost my job", "i am unemployed", "i need to find work", "i got laid off"],
    "financial-aid": ["my power is about to be shut off", "i cant pay my bills", "i am behind on my utilities",
                      "i need money for bills"],
    "legal": ["my landlord is evicting me", "i have a court date", "i need help with my divorce",
              "i am being sued"],
    "transportation": ["i have no car", "i cant get to my appointment", "i need a ride to the doctor"],
    "mental-health": ["i feel depressed", "i am stressed all the time", "i have anxiety", "i feel alone",
                      "my teenager is struggling"],
    "aging-adult": ["my mom has dementia", "my dad is getting older and needs help", "i am a senior and lonely"],
    "parenting-resources": ["i am pregnant", "i just had a baby", "i need diapers for my baby"],
    "clothing": ["my kids need clothes", "i need clothes for a job interview", "i need a winter coat"],
    "veterans": ["i am a veteran", "i served in the military and need help", "my husband is a veteran"],
    "immigration": ["i am undocumented", "i need help with my immigration case", "i want to become a citizen"],
    "rehabilitation": ["i just got out of prison", "i am on parole", "i have a record and cant find work"],
    "hospice": ["my husband is dying", "my mom just passed away", "i am grieving"],
    "pet-health-and-rescue": ["my dog is sick and i cant afford a vet", "i cant afford pet food"],
    "household-goods": ["i have no furniture", "i need a bed for my kids"],
}

# Tags too generic or too local to mean a need (place names are filtered separately).
TAG_STOPLIST = {
    "free", "nonprofit", "low income", "case management", "government agency", "government program", "waitlist",
    "both counties", "all welcome", "free service", "classes", "workshops", "webinars", "assessment", "screening",
    "enrollment", "saturdays", "24-hour", "24/7 access", "uc davis", "student-run", "evidence-based", "fit",
    "mat", "iop", "tay", "eops", "ilp", "lsnc", "smud", "cdfi", "sba", "csec", "icwa", "fqhc", "heap", "vita",
    "caleitc", "eitc", "energyhelp", "nextup", "sijs", "vawa", "idd", "ada", "county program", "access line",
    "nonprofit health system", "community service", "hall rental", "honor guard", "mandated reporters",
    "alta regional vendor", "doj accredited", "culturally responsive", "on-demand", "door-to-door", "residential",
    "meetings", "aging", "disabilities", "basic needs", "people with disabilities", "medical equipment",
    "community services", "dependents", "middle school", "elementary school", "after school", "free classes",
    "both", "walk-in", "volunteer",
}
