export interface LifeProps {
  x: number;
  y: number;
  id: number;
}

export class Life {
  id: number = 0;
  age = 0;
  lifeEnergy = 0;
  target = {
    x: 0,
    y: 0,
  };
  x = 0;
  y = 0;

  constructor(props: LifeProps) {
    const { x, y, id } = props;
    this.setPosition({ x, y });
    this.id = id;
  }

  ageUp = () => {
    this.age++;
    this.lifeEnergy--;
  }

  move = (dt: number) => { }

  setPosition = ({ x, y }: { x: number; y: number }) => {
    this.x = x;
    this.y = y;
  }

  setTarget = ({ x, y }: { x: number; y: number }) => {
    this.target = {
      x,
      y
    }
  }
}
