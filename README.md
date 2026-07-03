# CoDecBPMN: Collaborations Beyond Simple Message Flows
# And What Multi-model Processes Have to Do With It

This repository includes the proof-of-concept implementation and technical report for modeling and simulating multi-model process collaboration defined as a hybrid of BPMN and Declare.

([open technical report](./Technical_Report.pdf))
([go to the setup directly](#Setup))

The tool is build on top of the BPMN token simulation extension of bpmn.io. For further details, [click here](https://github.com/bpmn-io/bpmn-js-token-simulation).

## Video-Demonstration

[Click here](./demo_video.mp4) to see a video presenting the features of the modeling environment, and a demonstration of the simulation as well as interpretation for monitoring purposes.

## Modeling

To model declarative constraints, one has to create a BPMN collaboration model and add Declare constraints between activities of different pools.
In order to do so, one can either use the custom element that was added to the bottom of the modeling panel on the left and choose the constraint template from the menu that will be shown on the right, or use the Constraint Management panel on the right:
![Modeling Environment](https://github.com/tassmihaly/hybrid_process_monitoring/blob/main/pictures/Modeling_Environment.png?raw=true)
It should be mentioned that one current limitation is the modeling of unary constraints. The initial implementation only considered binary constraints between two activities. For that reason, to include "existence" and "absence2", one has to either add a constraint between the activity of interest and an arbitrary second one, which will be disregarded later, or choose the same activity in the Constraint Management panel.

Even though the tool is built on top of bpmn.io and, thus, includes all available elements of BPMN 2.0, the approach only supports the subset of BPMN that is shown in this picture:
![supported subset of BPMN](https://github.com/tassmihaly/hybrid_process_monitoring/blob/main/pictures/Supported_BPMN_elements.jpeg?raw=true)
The Declare constraints supported in the tool are:
![supported subset of BPMN](https://github.com/tassmihaly/hybrid_process_monitoring/blob/main/pictures/Supported_Declare_constraints.png?raw=true)


## Simulation

Simulation is based on the initial implementation of the BPMN token simulation extension. The tool was extended to incorporate execution semantics for multi-model collaborations, close to the ones described in the [technical report](./Technical_Report.pdf).

### Execution

Simulation can be done in two ways:
- Manual: each activity has to be executed manually, which allows for full control over the process behaviour.
- Semi-automatic (Default): when the process starts, the tokens run through the model on their own, only stopping at events that correspond to receiving messages, decision points and the second activity of a constraints.
Automatic execution can be stopped by using the panel on the right of the simulation screen (the PAUSE button on the bottom of the panel).

### Coloring

Constraints are colored during simulation based on an automata-theoretic approach, similar to the ones presented in related works. ([[1]](#1),[[2]](#2)). 

By default, colors are evaluated locally for each constraint. Local colors for each constraint have been assigned to the underlying colored DFA, in correspondence to coloring as presented in [[1]](#1).
Local colors have the following meaning:
- $${\color{green}GREEN}$$: the constraint is permanently satisfied
- $${\color{yellow}YELLOW}$$: the constraint is temporarily satisfied, but we can reach a state in which the constraint is violated
- $${\color{orange}ORANGE}$$: the constraint is temporarily violated, but we can reach a state in which the constraint is satisfied
- $${\color{red}RED}$$: the constraint is permanently violated

By toggling on the Color button, global coloring can be activated. Here, constraints are evaluated as a whole, and colors correspond to a global evaluation of satisfaction or violation of the process run. The concept and corresponding algorithm are described in the [technical report](./Technical_Report.pdf).
Global colors have the following meaning:
- $${\color{green}GREEN}$$: all constraints are permanently satisfied
- $${\color{yellow}YELLOW}$$: no constraint is currently violated, but at least one can become violated during execution
- $${\color{orange}ORANGE}$$: at least one constraint is currently violated, but process execution can still satisfy all constraints
- $${\color{red}RED}$$: at least one constraint is permanently violated
- $${\color{grey}GREY}$$: it is inclusive whether all constraints can be satisfied or if at least one constraint will be permanently violated

## Setup 

This repository includes a setup for building and running a container.

After cloning the repository, one has to execute the following command from the root directory:
```
docker-compose -f .\docker-compose.prod.yml up --build
```
(Provided that docker-compose is installed. For further details, [click here](https://docs.docker.com/compose/).)

(Works also with podman-compose. For further details, [click here](https://docs.podman.io/en/latest/markdown/podman-compose.1.html).)


For accessing the modeling environment, open a browser and go to [localhost:80/modeler.html](http://localhost:80/modeler.html) (Port can be changed under [docker-compose.prod.yml](./docker-compose.prod.yml), e.g., to 8080:80).


## GitHub Pages

This repository is configured to publish the static demo via GitHub Pages using GitHub Actions. You can access the tool [here](https://tassmihaly.github.io/hybrid_process_monitoring/modeler).


### Local build check

Run:
```
npm ci
npm run build:pages
```

This produces the static site under `example/` with bundled assets in `example/dist/`.

### Publish steps

1. Push your changes to `main` (or `master`).
2. In GitHub, go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Source: GitHub Actions**.
4. Wait for the workflow `Deploy GitHub Pages` to complete.
5. Open the deployed URL shown in the workflow summary.

Workflow file: `.github/workflows/deploy-pages.yml`


## References
<a id="1">[1]</a>
De Giacomo, G., De Masellis, R., Maria Maggi, F., Montali, M.: 
Monitoring constraints and metaconstraints with temporal logics on finite traces. ACM Trans. Softw. Eng. Methodol. 31(4), 68:1–68:44 (2022)

<a id="2">[2]</a>
Alman, A., Maggi, F.M., Montali, M., Patrizi, F., Rivkin, A.: 
Monitoring hybrid process specifications with conflict management: An automata-theoretic approach. Artificial Intelligence in Medicine 139, 102512 (2023)
