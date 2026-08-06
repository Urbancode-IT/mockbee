import { useState } from 'react'
import { KEYS, getJSON, setJSON } from '../../utils/storage'
import './RoadmapPage.css'

const ROADMAP_DATA = [
  {
    role: 'Python Developer',
    icon: 'fab fa-python',
    desc: 'Django, Flask, Data Processing, and Automation.',
    steps: [
      { title: 'Python Fundamentals', desc: 'Master syntax, data structures, and functional programming.', badge: 'Phase 01' },
      { title: 'Web Frameworks', desc: 'Build advanced APIs using Django and Flask.', badge: 'Phase 02' },
      { title: 'Database & ORM', desc: 'Connect applications to SQL and NoSQL databases.', badge: 'Phase 03' },
      { title: 'Scalability & Testing', desc: 'Implement CI/CD and comprehensive unit testing.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'Frontend Developer',
    icon: 'fas fa-globe',
    desc: 'React, Vue, CSS animations, and Responsive Design.',
    steps: [
      { title: 'HTML5 & CSS3 Mastery', desc: 'Semantic structure and modern layout techniques.', badge: 'Phase 01' },
      { title: 'JavaScript ES6+', desc: 'Async/Await, DOM manipulation, and modern JS patterns.', badge: 'Phase 02' },
      { title: 'Modern Frameworks', desc: 'Deep dive into React or Vue ecosystem and State Management.', badge: 'Phase 03' },
      { title: 'Performance & DX', desc: 'Web vitals optimization and build tools like Vite.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'Backend Developer',
    icon: 'fas fa-cogs',
    desc: 'Node.js, Databases, REST APIs, and Security.',
    steps: [
      { title: 'Server-side Basics', desc: 'Understanding HTTP, APIs, and Node.js core modules.', badge: 'Phase 01' },
      { title: 'Data Architecture', desc: 'Relational database design and query optimization.', badge: 'Phase 02' },
      { title: 'Security & Auth', desc: 'Implementing JWT, OAuth, and secure session management.', badge: 'Phase 03' },
      { title: 'Microservices', desc: 'Scalable architecture using Docker and Kubernetes.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'ML Engineer',
    icon: 'fas fa-brain',
    desc: 'PyTorch, TensorFlow, NLP, and Computer Vision.',
    steps: [
      { title: 'Math & Stats', desc: 'Linear Algebra, Calculus, and Probability for ML.', badge: 'Phase 01' },
      { title: 'Supervised Learning', desc: 'Regression, Classification, and Scikit-Learn tools.', badge: 'Phase 02' },
      { title: 'Deep Learning', desc: 'Neural Networks using PyTorch or TensorFlow.', badge: 'Phase 03' },
      { title: 'MLOps', desc: 'Model deployment, tracking, and infrastructure.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'Data Scientist',
    icon: 'fas fa-chart-bar',
    desc: 'Pandas, Statistics, and Data Visualization.',
    steps: [
      { title: 'Data Analysis', desc: 'Pandas, NumPy, and exploratory data analysis (EDA).', badge: 'Phase 01' },
      { title: 'Statistics', desc: 'Hypothesis testing, distributions, and inferential stats.', badge: 'Phase 02' },
      { title: 'Data Viz', desc: 'Storytelling with Matplotlib, Seaborn, or Tableau.', badge: 'Phase 03' },
      { title: 'Predictive Modeling', desc: 'Building and validating forecasting models.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'Cloud Engineer',
    icon: 'fas fa-cloud',
    desc: 'AWS, Azure, GCP, and Infrastructure management.',
    steps: [
      { title: 'Cloud Basics', desc: 'Virtualization, networking, and storage fundamentals.', badge: 'Phase 01' },
      { title: 'IaaS & PaaS', desc: 'Managing EC2, S3, and RDS in AWS/Azure.', badge: 'Phase 02' },
      { title: 'Infrastructure as Code', desc: 'Terraform, CloudFormation, and Ansible.', badge: 'Phase 03' },
      { title: 'Cloud Security', desc: 'IAM, VPC security, and compliance monitoring.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'DevOps Engineer',
    icon: 'fas fa-sync-alt',
    desc: 'CI/CD, Docker, Kubernetes, and Automation.',
    steps: [
      { title: 'Linux Mastery', desc: 'Bash scripting, system admin, and permissions.', badge: 'Phase 01' },
      { title: 'Containerization', desc: 'Dockerizing applications and registry management.', badge: 'Phase 02' },
      { title: 'CI/CD Pipelines', desc: 'Jenkins, GitHub Actions, or GitLab CI.', badge: 'Phase 03' },
      { title: 'Orchestration', desc: 'Kubernetes cluster management and Helm.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'Cybersecurity Analyst',
    icon: 'fas fa-shield-alt',
    desc: 'Pentesting, SIEM, SOC, and Network Security.',
    steps: [
      { title: 'Network Security', desc: 'TCP/IP, firewalls, and VPN architecture.', badge: 'Phase 01' },
      { title: 'Threat Detection', desc: 'SIEM tools and log analysis patterns.', badge: 'Phase 02' },
      { title: 'Ethical Hacking', desc: 'VA/PT basics and OWASP top 10.', badge: 'Phase 03' },
      { title: 'Incident Response', desc: 'Digital forensics and recovery strategies.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'Network Engineer',
    icon: 'fas fa-satellite-dish',
    desc: 'TCP/IP, BGP, VPN, and Router Configuration.',
    steps: [
      { title: 'Networking Basics', desc: 'OSI model, IP addressing, and subnetting.', badge: 'Phase 01' },
      { title: 'Routing & Switching', desc: 'Configuring BGP, OSPF, and VLANs.', badge: 'Phase 02' },
      { title: 'Network Security', desc: 'Firewalls, IPS, and VPN implementation.', badge: 'Phase 03' },
      { title: 'Network Automation', desc: 'SDN and Python for network configuration.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'System Architect',
    icon: 'fas fa-city',
    desc: 'Scalable Design, Design Patterns, and Microservices.',
    steps: [
      { title: 'HLD Foundations', desc: 'Load balancing, caching, and CDN strategies.', badge: 'Phase 01' },
      { title: 'Design Patterns', desc: 'Creational, Structural, and Behavioral patterns.', badge: 'Phase 02' },
      { title: 'Distributed Systems', desc: 'CAP theorem, consensus, and event-driven architecture.', badge: 'Phase 03' },
      { title: 'Enterprise Scaling', desc: 'Multi-region deployments and disaster recovery.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'QA Engineer',
    icon: 'fas fa-flask',
    desc: 'Selenium, Jest, Manual, and Automated Testing.',
    steps: [
      { title: 'Testing Basics', desc: 'Manual testing, bug reporting, and test cases.', badge: 'Phase 01' },
      { title: 'Automation Foundations', desc: 'Selenium or Cypress for web automation.', badge: 'Phase 02' },
      { title: 'API Testing', desc: 'Postman and automated API verification.', badge: 'Phase 03' },
      { title: 'TDD & CI/CD', desc: 'Integrating tests into the deployment flow.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'Mobile Developer',
    icon: 'fas fa-mobile-alt',
    desc: 'Flutter, React Native, iOS (Swift), and Android.',
    steps: [
      { title: 'Language Mastery', desc: 'Dart (Flutter) or Swift/Kotlin basics.', badge: 'Phase 01' },
      { title: 'UI/UX Design', desc: 'Mobile-first layouts, animations, and widgets.', badge: 'Phase 02' },
      { title: 'State Management', desc: 'Provider/Bloc or Redux for mobile apps.', badge: 'Phase 03' },
      { title: 'Native Bridge', desc: 'Integrating with camera, GPS, and sensors.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'Testing',
    icon: 'fas fa-vial',
    desc: 'Unit Testing, Integration Testing, and Quality Assurance.',
    steps: [
      { title: 'Unit Testing', desc: 'Mastering Jest, Mocha, or PyTest.', badge: 'Phase 01' },
      { title: 'Integration Testing', desc: 'Testing module interactions and workflows.', badge: 'Phase 02' },
      { title: 'E2E Testing', desc: 'Full system testing from user perspective.', badge: 'Phase 03' },
      { title: 'Performance Testing', desc: 'Load testing and stress testing tools.', badge: 'Phase 04' },
    ],
  },
  {
    role: 'AWS Specialist',
    icon: 'fab fa-aws',
    desc: 'EC2, S3, Lambda, and Cloud Architecture.',
    steps: [
      { title: 'AWS Core Services', desc: 'EC2, VPC, S3, and IAM foundations.', badge: 'Phase 01' },
      { title: 'Serverless Compute', desc: 'Lambda, API Gateway, and DynamoDB.', badge: 'Phase 02' },
      { title: 'Cloud Architecture', desc: 'Well-architected framework and cost optimization.', badge: 'Phase 03' },
      { title: 'DevOps on AWS', desc: 'CodePipeline, CodeBuild, and CloudFormation.', badge: 'Phase 04' },
    ],
  },
]

function logActivity(label) {
  const activities = getJSON(KEYS.activities, []) || []
  activities.unshift({ label, time: 'Just now', date: new Date().toISOString() })
  setJSON(KEYS.activities, activities.slice(0, 50))
}

export default function RoadmapPage() {
  const [selected, setSelected] = useState(null)

  const showDetails = (data) => {
    logActivity(`Viewed ${data.role} Roadmap`)
    setSelected(data)
    window.scrollTo(0, 0)
  }

  if (selected) {
    return (
      <div className="roadmap-page">
        <div className="detailed-view">
          <button type="button" className="back-btn" onClick={() => setSelected(null)}>
            <i className="fas fa-arrow-left" /> BACK TO DIRECTORY
          </button>
          <div className="roadmap-header">
            <p>Growth Path</p>
            <h1>{selected.role} Roadmap</h1>
          </div>
          <div className="roadmap-container">
            {selected.steps.map((step) => (
              <div className="roadmap-step" key={step.badge + step.title}>
                <div className="step-node" />
                <span className="step-badge">{step.badge}</span>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="roadmap-page">
      <div className="hub-header">
        <div>
          <p>Career Roadmap Directory</p>
          <h1>Explore Your Path</h1>
        </div>
      </div>
      <div className="roadmap-grid">
        {ROADMAP_DATA.map((data) => (
          <div
            key={data.role}
            className="role-roadmap-card"
            onClick={() => showDetails(data)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                showDetails(data)
              }
            }}
          >
            <div className="role-icon">
              <i className={data.icon} />
            </div>
            <div className="role-info">
              <h3>{data.role}</h3>
              <p>{data.desc}</p>
            </div>
            <div className="view-cta">
              View Roadmap <i className="fas fa-chevron-right" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
